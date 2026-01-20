-- Insert sample data into instructor_services

-- Function to assign services to instructors
CREATE OR REPLACE FUNCTION assign_services_to_instructors() RETURNS void AS $$
DECLARE
    current_instructor_id UUID;
    current_service_id UUID;
    instructor_cursor CURSOR FOR
        SELECT u.id FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'instructor';
    service_cursor CURSOR FOR
        SELECT id FROM services
        ORDER BY name
        LIMIT 5;
BEGIN
    -- For each instructor
    OPEN instructor_cursor;
    LOOP
        FETCH instructor_cursor INTO current_instructor_id;
        EXIT WHEN NOT FOUND;
        
        RAISE NOTICE 'Processing instructor %', current_instructor_id;
        
        -- For each service
        OPEN service_cursor;
        LOOP            FETCH service_cursor INTO current_service_id;
            EXIT WHEN NOT FOUND;
            
            -- Check if association already exists
            IF NOT EXISTS (
                SELECT 1 FROM instructor_services
                WHERE instructor_services.instructor_id = current_instructor_id AND 
                      instructor_services.service_id = current_service_id
            ) THEN
                -- Insert the association
                INSERT INTO instructor_services (instructor_id, service_id)
                VALUES (current_instructor_id, current_service_id);
                
                RAISE NOTICE 'Assigned service % to instructor %', current_service_id, current_instructor_id;
            ELSE
                RAISE NOTICE 'Service % already assigned to instructor %', current_service_id, current_instructor_id;
            END IF;
        END LOOP;
        CLOSE service_cursor;
    END LOOP;
    CLOSE instructor_cursor;
    
    RAISE NOTICE 'Sample instructor service assignments completed';
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT assign_services_to_instructors();

-- Drop the function when done
DROP FUNCTION assign_services_to_instructors();
