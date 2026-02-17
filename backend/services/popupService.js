import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { appendCreatedBy } from '../utils/auditUtils.js';

// Database helper object to maintain compatibility
const db = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect()
};

class PopupService {
    /**
     * Get all active popups that should be shown to a specific user
     */
    async getActivePopupsForUser(userId, pageRoute = null) {
        try {
            let query = `
                SELECT DISTINCT p.*,
                       COUNT(pui.id) as interaction_count,
                       MAX(pui.created_at) as last_interaction
                FROM popup_configurations p
                LEFT JOIN popup_targeting_rules ptr ON p.id = ptr.popup_id AND ptr.is_active = true
                LEFT JOIN popup_user_interactions pui ON p.id = pui.popup_id AND pui.user_id = $1
                WHERE p.is_active = true
            `;
            const params = [userId];

            // Add page targeting if specified
            if (pageRoute) {
                query += ` AND (ptr.rule_type != 'page_route' OR ptr.rule_value = $2 OR ptr.rule_value IS NULL)`;
                params.push(pageRoute);
            }

            query += `
                GROUP BY p.id
                HAVING COUNT(CASE WHEN pui.interaction_type = 'viewed' THEN 1 END) < p.max_displays_per_user
                ORDER BY p.priority DESC, p.created_at ASC
            `;

            const result = await db.query(query, params);
            
            // Filter based on targeting rules
            const filteredPopups = [];
            for (const popup of result.rows) {
                if (await this.checkPopupTargeting(popup.id, userId, pageRoute)) {
                    filteredPopups.push(popup);
                }
            }

            return filteredPopups;
        } catch (error) {
            logger.error('Error getting active popups for user:', error);
            throw error;
        }
    }

    /**
     * Check if a popup should be shown to a user based on targeting rules
     */
    async checkPopupTargeting(popupId, userId, pageRoute = null) {
        try {
            // Get user data for rule evaluation
            const userResult = await db.query(`
                SELECT u.*, r.name as role_name,
                       (SELECT COUNT(*) FROM popup_user_interactions WHERE user_id = u.id AND interaction_type = 'viewed') as total_popup_views,
                       (SELECT COUNT(*) FROM security_audit WHERE user_id = u.id AND action = 'login' AND success = true) as login_count
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = $1
            `, [userId]);

            if (!userResult.rows.length) return false;
            const user = userResult.rows[0];

            // Get targeting rules for this popup
            const rulesResult = await db.query(`
                SELECT * FROM popup_targeting_rules 
                WHERE popup_id = $1 AND is_active = true 
                ORDER BY rule_operator ASC
            `, [popupId]);

            if (!rulesResult.rows.length) return true; // No rules = show to everyone

            let shouldShow = true;
            for (const rule of rulesResult.rows) {
                const ruleMatches = await this.evaluateTargetingRule(rule, user, pageRoute);
                
                if (rule.rule_operator === 'AND') {
                    shouldShow = shouldShow && ruleMatches;
                } else if (rule.rule_operator === 'OR') {
                    shouldShow = shouldShow || ruleMatches;
                }
            }

            return shouldShow;
        } catch (error) {
            logger.error('Error checking popup targeting:', error);
            return false;
        }
    }

    /**
     * Evaluate a single targeting rule
     */
    async evaluateTargetingRule(rule, user, pageRoute = null) {
        const { rule_type, rule_condition, rule_value } = rule;

        switch (rule_type) {
            case 'user_role':
                return this.compareValues(user.role_name, rule_condition, rule_value);
            
            case 'login_count':
                return this.compareValues(user.login_count, rule_condition, parseInt(rule_value));
            
            case 'registration_date':
                const registrationDate = new Date(user.created_at);
                const targetDate = new Date(rule_value);
                return this.compareValues(registrationDate, rule_condition, targetDate);
            
            case 'page_route':
                return this.compareValues(pageRoute, rule_condition, rule_value);
            
            case 'time_based':
                const now = new Date();
                const timeValue = new Date(rule_value);
                return this.compareValues(now, rule_condition, timeValue);
            
            case 'feature_access':
                // This would require checking if user has accessed specific features
                // Implementation depends on how feature access is tracked
                return true;
            
            default:
                return true;
        }
    }

    /**
     * Compare values based on condition
     */
    compareValues(actualValue, condition, expectedValue) {
        switch (condition) {
            case 'equals':
                return actualValue === expectedValue;
            case 'not_equals':
                return actualValue !== expectedValue;
            case 'greater_than':
                return actualValue > expectedValue;
            case 'less_than':
                return actualValue < expectedValue;
            case 'greater_equal':
                return actualValue >= expectedValue;
            case 'less_equal':
                return actualValue <= expectedValue;
            case 'contains':
                return actualValue && actualValue.toString().includes(expectedValue);
            case 'not_contains':
                return !actualValue || !actualValue.toString().includes(expectedValue);
            case 'between':
                const [min, max] = expectedValue.split(',').map(v => parseFloat(v.trim()));
                return actualValue >= min && actualValue <= max;
            default:
                return false;
        }
    }

    /**
     * Get popup content blocks
     */
    async getPopupContent(popupId) {
        try {
            const result = await db.query(`
                SELECT * FROM popup_content_blocks 
                WHERE popup_id = $1 AND is_active = true 
                ORDER BY step_number, display_order
            `, [popupId]);

            return result.rows;
        } catch (error) {
            logger.error('Error getting popup content:', error);
            throw error;
        }
    }

    /**
     * Record user interaction with popup
     */
    async recordUserInteraction(popupId, userId, interactionType, interactionData = {}, stepNumber = 1, actorId = null) {
        try {
            const normalizedData = JSON.stringify(interactionData);
            const baseColumns = [
                'popup_id',
                'user_id',
                'interaction_type',
                'interaction_data',
                'step_number',
                'session_id',
                'page_url'
            ];
            const baseValues = [
                popupId,
                userId,
                interactionType,
                normalizedData,
                stepNumber,
                interactionData.sessionId || null,
                interactionData.pageUrl || null
            ];
            const { columns, values } = appendCreatedBy(baseColumns, baseValues, actorId ?? userId);
            const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

            const result = await db.query(`
                INSERT INTO popup_user_interactions (${columns.join(', ')})
                VALUES (${placeholders})
                ON CONFLICT (popup_id, user_id, interaction_type, step_number) 
                DO UPDATE SET 
                    interaction_data = EXCLUDED.interaction_data,
                    step_number = EXCLUDED.step_number,
                    session_id = EXCLUDED.session_id,
                    page_url = EXCLUDED.page_url,
                    created_at = CURRENT_TIMESTAMP
                RETURNING *
            `, values);

            // Update analytics
            await this.updatePopupAnalytics(popupId, interactionType);

            return result.rows[0];
        } catch (error) {
            logger.error('Error recording user interaction:', error);
            throw error;
        }
    }

    /**
     * Update popup analytics
     */
    async updatePopupAnalytics(popupId, interactionType) {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Get or create analytics record for today
            await db.query(`
                INSERT INTO popup_analytics (popup_id, date_recorded)
                VALUES ($1, $2)
                ON CONFLICT (popup_id, date_recorded, ab_test_group) 
                DO NOTHING
            `, [popupId, today]);

            // Update specific metrics based on interaction type
            let updateField = '';
            switch (interactionType) {
                case 'viewed':
                    updateField = 'total_views = total_views + 1, unique_viewers = unique_viewers + 1';
                    break;
                case 'dismissed':
                    updateField = 'total_dismissals = total_dismissals + 1';
                    break;
                case 'clicked_primary':
                    updateField = 'primary_button_clicks = primary_button_clicks + 1';
                    break;
                case 'clicked_secondary':
                    updateField = 'secondary_button_clicks = secondary_button_clicks + 1';
                    break;
                case 'completed_form':
                    updateField = 'form_submissions = form_submissions + 1';
                    break;
                case 'social_click':
                    updateField = 'social_clicks = social_clicks + 1';
                    break;
                case 'link_click':
                    updateField = 'link_clicks = link_clicks + 1';
                    break;
            }

            if (updateField) {
                await db.query(`
                    UPDATE popup_analytics 
                    SET ${updateField}, updated_at = CURRENT_TIMESTAMP
                    WHERE popup_id = $1 AND date_recorded = $2
                `, [popupId, today]);
            }
        } catch (error) {
            logger.error('Error updating popup analytics:', error);
            // Don't throw error for analytics updates
        }
    }

    /**
     * Get all popup configurations (for admin)
     */
    async getAllPopups(limit = 50, offset = 0, filters = {}) {
        try {
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramCount = 0;

            if (filters.popup_type) {
                whereClause += ` AND popup_type = $${++paramCount}`;
                params.push(filters.popup_type);
            }

            if (filters.is_active !== undefined) {
                whereClause += ` AND is_active = $${++paramCount}`;
                params.push(filters.is_active);
            }

            if (filters.search) {
                whereClause += ` AND (title ILIKE $${++paramCount} OR subtitle ILIKE $${paramCount} OR body_text ILIKE $${paramCount})`;
                params.push(`%${filters.search}%`);
            }

            const query = `
                SELECT p.*,
                       COUNT(pui.id) as total_interactions,
                       COUNT(DISTINCT pui.user_id) as unique_users_reached
                FROM popup_configurations p
                LEFT JOIN popup_user_interactions pui ON p.id = pui.popup_id
                ${whereClause}
                GROUP BY p.id
                ORDER BY p.created_at DESC
                LIMIT $${++paramCount} OFFSET $${++paramCount}
            `;
            params.push(limit, offset);

            const result = await db.query(query, params);
            
            // Get total count
            const countQuery = `
                SELECT COUNT(DISTINCT p.id) as total
                FROM popup_configurations p
                ${whereClause}
            `;
            const countResult = await db.query(countQuery, params.slice(0, -2));

            return {
                popups: result.rows,
                total: parseInt(countResult.rows[0].total),
                limit,
                offset
            };
        } catch (error) {
            logger.error('Error getting all popups:', error);
            throw error;
        }
    }

    /**
     * Create new popup configuration
     */
    async createPopup(popupData, createdBy) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Create main popup configuration
            const popup = await this._createPopupConfiguration(client, popupData, createdBy);

            // Add content blocks if provided
            if (popupData.content_blocks && popupData.content_blocks.length > 0) {
                await this._addContentBlocks(client, popup.id, popupData.content_blocks);
            }

            // Add targeting rules if provided
            if (popupData.targeting_rules && popupData.targeting_rules.length > 0) {
                await this._addTargetingRules(client, popup.id, popupData.targeting_rules);
            }

            await client.query('COMMIT');
            return popup;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Error creating popup:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create popup configuration record
     */
    async _createPopupConfiguration(client, popupData, createdBy) {
        const config = this._buildPopupConfig(popupData, createdBy);
        
        const popupResult = await client.query(`
            INSERT INTO popup_configurations (
                name, title, subtitle, body_text, is_active, popup_type, priority,
                modal_size, layout_template, animation_type, color_theme,
                background_type, background_value, border_radius, has_shadow,
                is_multi_step, column_layout, image_position, text_alignment,
                display_delay, auto_close_delay, max_displays_per_user, cooldown_period,
                created_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22, $23, $24
            ) RETURNING *
        `, Object.values(config));

        return popupResult.rows[0];
    }

    /**
     * Build popup configuration with defaults
     */
    // eslint-disable-next-line complexity
    _buildPopupConfig(popupData, createdBy) {
        return {
            name: popupData.name,
            title: popupData.title,
            subtitle: popupData.subtitle || null,
            body_text: popupData.body_text || null,
            is_active: popupData.is_active || false,
            popup_type: popupData.popup_type || 'welcome',
            priority: popupData.priority || 1,
            modal_size: popupData.modal_size || 'medium',
            layout_template: popupData.layout_template || 'centered',
            animation_type: popupData.animation_type || 'fade',
            color_theme: popupData.color_theme || 'default',
            background_type: popupData.background_type || 'color',
            background_value: popupData.background_value || null,
            border_radius: popupData.border_radius || 8,
            has_shadow: popupData.has_shadow !== false,
            is_multi_step: popupData.is_multi_step || false,
            column_layout: popupData.column_layout || 1,
            image_position: popupData.image_position || 'top',
            text_alignment: popupData.text_alignment || 'center',
            display_delay: popupData.display_delay || 0,
            auto_close_delay: popupData.auto_close_delay || 0,
            max_displays_per_user: popupData.max_displays_per_user || 1,
            cooldown_period: popupData.cooldown_period || 0,
            created_by: createdBy
        };
    }

    /**
     * Add content blocks to popup
     */
    async _addContentBlocks(client, popupId, contentBlocks) {
        for (const block of contentBlocks) {
            await client.query(`
                INSERT INTO popup_content_blocks (
                    popup_id, block_type, content_data, display_order, step_number
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                popupId,
                block.block_type,
                JSON.stringify(block.content_data),
                block.display_order || 0,
                block.step_number || 1
            ]);
        }
    }

    /**
     * Add targeting rules to popup
     */
    async _addTargetingRules(client, popupId, targetingRules) {
        for (const rule of targetingRules) {
            await client.query(`
                INSERT INTO popup_targeting_rules (
                    popup_id, rule_type, rule_condition, rule_value, rule_operator
                ) VALUES ($1, $2, $3, $4, $5)
            `, [
                popupId,
                rule.rule_type,
                rule.rule_condition,
                rule.rule_value,
                rule.rule_operator || 'AND'
            ]);
        }
    }

    /**
     * Update popup configuration
     */
    async updatePopup(popupId, popupData, updatedBy) {
        try {
            const result = await db.query(`
                UPDATE popup_configurations SET
                    name = COALESCE($2, name),
                    title = COALESCE($3, title),
                    subtitle = COALESCE($4, subtitle),
                    body_text = COALESCE($5, body_text),
                    is_active = COALESCE($6, is_active),
                    popup_type = COALESCE($7, popup_type),
                    priority = COALESCE($8, priority),
                    modal_size = COALESCE($9, modal_size),
                    layout_template = COALESCE($10, layout_template),
                    animation_type = COALESCE($11, animation_type),
                    color_theme = COALESCE($12, color_theme),
                    background_type = COALESCE($13, background_type),
                    background_value = COALESCE($14, background_value),
                    updated_by = $15,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `, [
                popupId,
                popupData.name,
                popupData.title,
                popupData.subtitle,
                popupData.body_text,
                popupData.is_active,
                popupData.popup_type,
                popupData.priority,
                popupData.modal_size,
                popupData.layout_template,
                popupData.animation_type,
                popupData.color_theme,
                popupData.background_type,
                popupData.background_value,
                updatedBy
            ]);

            return result.rows[0];
        } catch (error) {
            logger.error('Error updating popup:', error);
            throw error;
        }
    }

    /**
     * Delete popup configuration
     */
    async deletePopup(popupId) {
        try {
            const result = await db.query(`
                DELETE FROM popup_configurations 
                WHERE id = $1 
                RETURNING *
            `, [popupId]);

            return result.rows[0];
        } catch (error) {
            logger.error('Error deleting popup:', error);
            throw error;
        }
    }

    /**
     * Get popup analytics
     */
    async getPopupAnalytics(popupId, startDate = null, endDate = null) {
        try {
            let whereClause = 'WHERE popup_id = $1';
            const params = [popupId];

            if (startDate) {
                whereClause += ` AND date_recorded >= $${params.length + 1}`;
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ` AND date_recorded <= $${params.length + 1}`;
                params.push(endDate);
            }

            const result = await db.query(`
                SELECT 
                    date_recorded,
                    SUM(total_views) as total_views,
                    SUM(unique_viewers) as unique_viewers,
                    SUM(total_dismissals) as total_dismissals,
                    SUM(primary_button_clicks) as primary_button_clicks,
                    SUM(secondary_button_clicks) as secondary_button_clicks,
                    SUM(form_submissions) as form_submissions,
                    AVG(avg_display_time_seconds) as avg_display_time_seconds,
                    AVG(conversion_rate) as avg_conversion_rate
                FROM popup_analytics 
                ${whereClause}
                GROUP BY date_recorded
                ORDER BY date_recorded DESC
            `, params);

            return result.rows;
        } catch (error) {
            logger.error('Error getting popup analytics:', error);
            throw error;
        }
    }

    /**
     * Get popup templates
     */
    async getPopupTemplates(templateType = null) {
        try {
            let whereClause = 'WHERE is_active = true';
            const params = [];

            if (templateType) {
                whereClause += ` AND template_type = $${params.length + 1}`;
                params.push(templateType);
            }

            const result = await db.query(`
                SELECT * FROM popup_templates 
                ${whereClause}
                ORDER BY is_system_template DESC, usage_count DESC, name ASC
            `, params);

            return result.rows;
        } catch (error) {
            logger.error('Error getting popup templates:', error);
            throw error;
        }
    }

    /**
     * Create popup from template
     */
    async createPopupFromTemplate(templateId, customizations = {}, createdBy) {
        try {
            // Get template
            const templateResult = await db.query(`
                SELECT * FROM popup_templates WHERE id = $1
            `, [templateId]);

            if (!templateResult.rows.length) {
                throw new Error('Template not found');
            }

            const template = templateResult.rows[0];
            const config = template.default_config;
            const contentBlocks = template.default_content_blocks;

            // Merge customizations
            const popupData = {
                ...config,
                ...customizations,
                content_blocks: contentBlocks,
                targeting_rules: template.default_targeting_rules || []
            };

            // Update template usage count
            await db.query(`
                UPDATE popup_templates 
                SET usage_count = usage_count + 1 
                WHERE id = $1
            `, [templateId]);

            return await this.createPopup(popupData, createdBy);
        } catch (error) {
            logger.error('Error creating popup from template:', error);
            throw error;
        }
    }

    /**
     * Get eligible popups for user based on conditions
     */
    async getEligiblePopups(userId, _conditions = {}) {
        try {
            // Check if popup tables exist first
            const tableCheckQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'popup_configurations'
                );
            `;
            
            const tableExists = await db.query(tableCheckQuery);
            if (!tableExists.rows[0].exists) {
                logger.warn('popup_configurations table does not exist');
                return [];
            }

            const query = `
                SELECT DISTINCT p.*,
                       COALESCE(p.config, '{}') as config
                FROM popup_configurations p
                WHERE p.is_active = true
                ORDER BY p.priority DESC, p.created_at DESC
            `;

            const result = await db.query(query);
            const allPopups = result.rows;

            // Filter popups based on user display history
            const eligiblePopups = [];
            
            for (const popup of allPopups) {
                const hasBeenShown = await this.hasPopupBeenShown(popup.id, userId);
                
                // Simple frequency check - can be expanded based on popup configuration
                if (!hasBeenShown) {
                    eligiblePopups.push({
                        id: popup.id,
                        name: popup.name,
                        title: popup.title,
                        enabled: popup.is_active,
                        config: popup.config || {}
                    });
                }
            }

            return eligiblePopups;
        } catch (error) {
            logger.error('Error getting eligible popups:', error);
            // Return empty array instead of throwing to prevent 500 errors
            return [];
        }
    }

    /**
     * Check if popup has been shown to user
     */
    async hasPopupBeenShown(popupId, userId) {
        try {
            // Check if popup_user_interactions table exists
            const tableCheckQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'popup_user_interactions'
                );
            `;
            
            const tableExists = await db.query(tableCheckQuery);
            if (!tableExists.rows[0].exists) {
                // If table doesn't exist, assume popup hasn't been shown
                return false;
            }

            const query = `
                SELECT 1 FROM popup_user_interactions 
                WHERE popup_id = $1 AND user_id = $2 AND interaction_type = 'viewed'
                LIMIT 1
            `;
            const result = await db.query(query, [popupId, userId]);
            return result.rows.length > 0;
        } catch (error) {
            logger.error('Error checking popup interaction history:', error);
            // Default to not shown if there's an error
            return false;
        }
    }

    /**
     * Track popup events
     */
    async trackPopupEvent(popupId, userId, eventType, data = {}, actorId = null) {
        try {
            const normalizedData = JSON.stringify(data);
            const baseColumns = [
                'popup_id',
                'user_id',
                'interaction_type',
                'interaction_data'
            ];
            const baseValues = [
                popupId,
                userId,
                eventType,
                normalizedData
            ];
            const { columns, values } = appendCreatedBy(baseColumns, baseValues, actorId ?? userId);
            const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

            const query = `
                INSERT INTO popup_user_interactions (${columns.join(', ')})
                VALUES (${placeholders})
                RETURNING *
            `;
            
            const result = await db.query(query, values);
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error tracking popup event:', error);
            throw new Error(`Failed to track popup event: ${error.message}`);
        }
    }
}

export default new PopupService();
