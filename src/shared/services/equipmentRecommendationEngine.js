import { weatherService } from '../weatherService';

class EquipmentRecommendationEngine {
  constructor() {
    this.equipmentDatabase = null;
    this.initialized = false;
  }

  /**
   * Initialize the recommendation engine
   */
  async init() {
    if (this.initialized) return;

    try {
      await this.loadEquipmentDatabase();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize equipment recommendation engine:', error);
    }
  }

  /**
   * Load equipment database
   */
  async loadEquipmentDatabase() {
    try {
      const response = await fetch('/api/equipment/database', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        this.equipmentDatabase = await response.json();
      } else {
        // Fallback to default database
        this.equipmentDatabase = this.getDefaultEquipmentDatabase();
      }
    } catch (error) {
      console.error('Error loading equipment database:', error);
      this.equipmentDatabase = this.getDefaultEquipmentDatabase();
    }
  }

  /**
   * Get equipment recommendations for a lesson
   * @param {Object} params - Recommendation parameters
   */
  async getRecommendations(params) {
    const {
      studentLevel,
      studentWeight,
      studentHeight,
      weatherConditions,
      lessonType,
      location,
      preferences = {}
    } = params;

    if (!this.initialized) {
      await this.init();
    }

    try {
      // Get current weather if not provided
      const weather = weatherConditions || await weatherService.getCurrentWeather();
      
      const recommendations = {
        kite: this.recommendKite(studentLevel, studentWeight, weather, preferences),
        board: this.recommendBoard(studentLevel, studentWeight, studentHeight, lessonType, preferences),
        harness: this.recommendHarness(studentLevel, studentWeight, preferences),
        wetsuit: this.recommendWetsuit(weather, preferences),
        accessories: this.recommendAccessories(studentLevel, weather, lessonType),
        safety: this.recommendSafetyEquipment(studentLevel, weather)
      };

      // Calculate overall suitability score
      recommendations.overallScore = this.calculateOverallScore(recommendations, weather);
      recommendations.weatherConditions = weather;
      recommendations.safetyNotes = this.generateSafetyNotes(recommendations, weather, studentLevel);

      return recommendations;
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return this.getFallbackRecommendations(studentLevel);
    }
  }

  /**
   * Recommend kite based on conditions
   */
  recommendKite(studentLevel, studentWeight, weather, preferences) {
    const windSpeed = weather.wind?.speed || 15;
    const gustFactor = weather.wind?.gust ? weather.wind.gust / weather.wind.speed : 1.3;
    
    // Base kite size calculation
    let baseSize = this.calculateKiteSize(studentWeight, windSpeed, studentLevel);
    
    // Adjust for conditions
    if (gustFactor > 1.4) {
      baseSize += 1; // Larger kite for gusty conditions
    }
    
    if (weather.kitesurfingConditions?.safety === 'caution') {
      baseSize += 0.5; // More conservative sizing
    }

    // Get available kites
    const availableKites = this.getAvailableEquipment('kite').filter(kite => {
      const kiteSize = parseFloat(kite.size);
      return Math.abs(kiteSize - baseSize) <= 2; // Within 2m²
    });

    // Score and sort kites
    const scoredKites = availableKites.map(kite => ({
      ...kite,
      score: this.scoreKite(kite, baseSize, windSpeed, studentLevel, preferences),
      suitabilityReason: this.getKiteSuitabilityReason(kite, baseSize, windSpeed, studentLevel)
    }));

    scoredKites.sort((a, b) => b.score - a.score);

    return {
      recommended: scoredKites[0] || null,
      alternatives: scoredKites.slice(1, 4),
      recommendedSize: baseSize,
      windRange: this.getKiteWindRange(baseSize, studentWeight),
      notes: this.getKiteNotes(baseSize, windSpeed, studentLevel, gustFactor)
    };
  }

  /**
   * Calculate optimal kite size
   */
  calculateKiteSize(weight, windSpeed, level) {
    // Base formula: larger kites for lighter riders and lower winds
    let baseSize = (weight / windSpeed) * 2.5;

    // Adjust for skill level
    const levelAdjustments = {
      'beginner': 2,
      'intermediate': 0,
      'advanced': -1,
      'expert': -2
    };

    baseSize += levelAdjustments[level] || 0;

    // Clamp to reasonable range
    return Math.max(5, Math.min(17, Math.round(baseSize)));
  }

  /**
   * Recommend board based on student characteristics
   */
  recommendBoard(studentLevel, studentWeight, studentHeight, lessonType, preferences) {
    const availableBoards = this.getAvailableEquipment('board');
    
    // Determine board characteristics
    const boardSpecs = this.getBoardSpecs(studentLevel, studentWeight, studentHeight, lessonType);
    
    const scoredBoards = availableBoards.map(board => ({
      ...board,
      score: this.scoreBoard(board, boardSpecs, preferences),
      suitabilityReason: this.getBoardSuitabilityReason(board, boardSpecs, studentLevel)
    }));

    scoredBoards.sort((a, b) => b.score - a.score);

    return {
      recommended: scoredBoards[0] || null,
      alternatives: scoredBoards.slice(1, 3),
      recommendedSpecs: boardSpecs,
      notes: this.getBoardNotes(boardSpecs, studentLevel, lessonType)
    };
  }

  /**
   * Get recommended board specifications
   */
  getBoardSpecs(level, weight, height, lessonType) {
    const specs = {
      length: this.calculateBoardLength(weight, height, level),
      width: this.calculateBoardWidth(weight, level),
      style: this.getBoardStyle(level, lessonType),
      fins: this.getFinRecommendation(level, lessonType)
    };

    return specs;
  }

  /**
   * Calculate board length
   */
  calculateBoardLength(weight, height, level) {
    let baseLength = (weight * 2.2) + (height * 0.8); // Convert kg to approximate cm
    
    const levelAdjustments = {
      'beginner': 10,
      'intermediate': 5,
      'advanced': 0,
      'expert': -5
    };

    baseLength += levelAdjustments[level] || 0;
    
    return Math.max(130, Math.min(150, Math.round(baseLength)));
  }

  /**
   * Recommend harness
   */
  recommendHarness(studentLevel, studentWeight, preferences) {
    const availableHarnesses = this.getAvailableEquipment('harness');
    
    const harnessType = this.getHarnessType(studentLevel);
    const size = this.getHarnessSize(studentWeight);
    
    const scoredHarnesses = availableHarnesses.map(harness => ({
      ...harness,
      score: this.scoreHarness(harness, harnessType, size, preferences),
      suitabilityReason: this.getHarnessSuitabilityReason(harness, harnessType, studentLevel)
    }));

    scoredHarnesses.sort((a, b) => b.score - a.score);

    return {
      recommended: scoredHarnesses[0] || null,
      alternatives: scoredHarnesses.slice(1, 3),
      recommendedType: harnessType,
      recommendedSize: size,
      notes: this.getHarnessNotes(harnessType, studentLevel)
    };
  }

  /**
   * Recommend wetsuit based on weather
   */
  recommendWetsuit(weather, preferences) {
    const waterTemp = this.estimateWaterTemperature(weather);
    const airTemp = weather.temperature || 20;
    
    const thickness = this.getWetsuitThickness(waterTemp, airTemp);
    const style = this.getWetsuitStyle(waterTemp, airTemp);
    
    const availableWetsuits = this.getAvailableEquipment('wetsuit');
    
    const scoredWetsuits = availableWetsuits.map(wetsuit => ({
      ...wetsuit,
      score: this.scoreWetsuit(wetsuit, thickness, style, preferences),
      suitabilityReason: this.getWetsuitSuitabilityReason(wetsuit, thickness, waterTemp)
    }));

    scoredWetsuits.sort((a, b) => b.score - a.score);

    return {
      recommended: scoredWetsuits[0] || null,
      alternatives: scoredWetsuits.slice(1, 3),
      recommendedThickness: thickness,
      recommendedStyle: style,
      waterTemperature: waterTemp,
      notes: this.getWetsuitNotes(thickness, waterTemp, airTemp)
    };
  }

  /**
   * Recommend accessories
   */
  recommendAccessories(studentLevel, weather, lessonType) {
    const accessories = [];

    // Safety accessories
    if (studentLevel === 'beginner') {
      accessories.push({
        type: 'helmet',
        importance: 'high',
        reason: 'Essential safety equipment for beginners'
      });
    }

    // Weather-based accessories
    if (weather.weather?.main === 'Rain') {
      accessories.push({
        type: 'waterproof_bag',
        importance: 'medium',
        reason: 'Protect personal items from rain'
      });
    }

    if (weather.wind?.speed > 20) {
      accessories.push({
        type: 'wind_meter',
        importance: 'high',
        reason: 'Monitor wind conditions for safety'
      });
    }

    // UV protection
    if (weather.weather?.icon?.includes('01') || weather.weather?.icon?.includes('02')) {
      accessories.push({
        type: 'sunglasses',
        importance: 'medium',
        reason: 'UV protection in sunny conditions'
      });
    }

    return accessories;
  }

  /**
   * Recommend safety equipment
   */
  recommendSafetyEquipment(studentLevel, weather) {
    const safety = [];

    // Always recommend safety leash
    safety.push({
      type: 'safety_leash',
      importance: 'critical',
      reason: 'Essential for kite control and safety'
    });

    // Helmet for beginners and rough conditions
    if (studentLevel === 'beginner' || weather.kitesurfingConditions?.safety === 'caution') {
      safety.push({
        type: 'helmet',
        importance: 'high',
        reason: 'Protection for head injuries'
      });
    }

    // Impact vest for rough conditions
    if (weather.wind?.speed > 25 || weather.kitesurfingConditions?.safety === 'caution') {
      safety.push({
        type: 'impact_vest',
        importance: 'high',
        reason: 'Additional protection in strong wind conditions'
      });
    }

    // Emergency whistle
    safety.push({
      type: 'emergency_whistle',
      importance: 'medium',
      reason: 'Emergency signaling device'
    });

    return safety;
  }

  /**
   * Score equipment based on suitability
   */
  scoreKite(kite, targetSize, windSpeed, studentLevel, preferences) {
    let score = 100;

    // Size match
    const kiteSize = parseFloat(kite.size) || 12;
    const sizeDiff = Math.abs(kiteSize - targetSize);
    score -= sizeDiff * 10;

    // Wind range suitability
    if (kite.wind_range_low && kite.wind_range_high) {
      if (windSpeed < kite.wind_range_low || windSpeed > kite.wind_range_high) {
        score -= 30;
      }
    }

    // Skill level match
    const levelScores = {
      'beginner': { 'beginner': 20, 'intermediate': 10, 'advanced': 0, 'expert': -10 },
      'intermediate': { 'beginner': 10, 'intermediate': 20, 'advanced': 15, 'expert': 5 },
      'advanced': { 'beginner': 0, 'intermediate': 15, 'advanced': 20, 'expert': 15 },
      'expert': { 'beginner': -10, 'intermediate': 5, 'advanced': 15, 'expert': 20 }
    };

    const kiteLevel = kite.skill_level || 'intermediate';
    score += levelScores[studentLevel]?.[kiteLevel] || 0;

    // Condition assessment
    if (kite.condition === 'new') score += 10;
    if (kite.condition === 'poor') score -= 20;

    // Availability
    if (kite.status !== 'available') score -= 50;

    // Brand preference
    if (preferences.preferredBrand && kite.brand === preferences.preferredBrand) {
      score += 15;
    }

    return Math.max(0, score);
  }

  /**
   * Get available equipment by type
   */
  getAvailableEquipment(type) {
    if (!this.equipmentDatabase || !this.equipmentDatabase[type]) {
      return this.getDefaultEquipment(type);
    }

    return this.equipmentDatabase[type].filter(item => item.status === 'available');
  }

  /**
   * Generate safety notes
   */
  generateSafetyNotes(recommendations, weather, studentLevel) {
    const notes = [];

    if (weather.kitesurfingConditions?.safety === 'unsafe') {
      notes.push('⚠️ UNSAFE CONDITIONS: Lesson should be cancelled');
    }

    if (weather.kitesurfingConditions?.safety === 'caution') {
      notes.push('⚡ CAUTION: Extra safety measures required');
    }

    if (weather.wind?.speed > 20) {
      notes.push('💨 Strong winds detected - ensure proper safety equipment');
    }

    if (studentLevel === 'beginner' && weather.wind?.speed > 15) {
      notes.push('🎓 Consider postponing for more suitable beginner conditions');
    }

    if (!recommendations.kite.recommended) {
      notes.push('🪁 No suitable kite available - check equipment inventory');
    }

    return notes;
  }

  /**
   * Calculate overall equipment suitability score
   */
  calculateOverallScore(recommendations, weather) {
    let totalScore = 0;
    let componentCount = 0;

    Object.entries(recommendations).forEach(([key, value]) => {
      if (value && typeof value === 'object' && value.recommended) {
        totalScore += value.recommended.score || 0;
        componentCount++;
      }
    });

    if (componentCount === 0) return 0;

    let averageScore = totalScore / componentCount;

    // Adjust for weather conditions
    if (weather.kitesurfingConditions?.safety === 'unsafe') {
      averageScore = 0;
    } else if (weather.kitesurfingConditions?.safety === 'caution') {
      averageScore *= 0.7;
    }

    return Math.round(averageScore);
  }

  /**
   * Get default equipment database (fallback)
   */
  getDefaultEquipmentDatabase() {
    return {
      kite: [
        { id: 1, name: 'Beginner Kite 12m', size: '12', skill_level: 'beginner', wind_range_low: 10, wind_range_high: 20, status: 'available', condition: 'good', brand: 'Cabrinha' },
        { id: 2, name: 'All-Round 10m', size: '10', skill_level: 'intermediate', wind_range_low: 12, wind_range_high: 25, status: 'available', condition: 'good', brand: 'Duotone' }
      ],
      board: [
        { id: 1, name: 'Beginner Twin Tip 140cm', size: '140x42', skill_level: 'beginner', status: 'available', condition: 'good', style: 'twin_tip' },
        { id: 2, name: 'Freestyle Board 138cm', size: '138x41', skill_level: 'intermediate', status: 'available', condition: 'good', style: 'freestyle' }
      ],
      harness: [
        { id: 1, name: 'Waist Harness M', size: 'M', type: 'waist', status: 'available', condition: 'good' },
        { id: 2, name: 'Seat Harness L', size: 'L', type: 'seat', status: 'available', condition: 'good' }
      ],
      wetsuit: [
        { id: 1, name: '3/2mm Wetsuit M', size: 'M', thickness: '3/2', status: 'available', condition: 'good' },
        { id: 2, name: '5/4mm Wetsuit L', size: 'L', thickness: '5/4', status: 'available', condition: 'good' }
      ]
    };
  }

  /**
   * Get default equipment for a specific type
   */
  getDefaultEquipment(type) {
    const defaults = this.getDefaultEquipmentDatabase();
    return defaults[type] || [];
  }

  /**
   * Estimate water temperature based on air temperature and season
   */
  estimateWaterTemperature(weather) {
    const airTemp = weather.temperature || 20;
    const month = new Date().getMonth() + 1; // 1-12
    
    // Rough estimation for Mediterranean conditions
    let waterTemp = airTemp - 5; // Water is typically cooler than air
    
    // Seasonal adjustment
    if (month >= 6 && month <= 9) { // Summer
      waterTemp += 2;
    } else if (month >= 12 || month <= 2) { // Winter
      waterTemp -= 3;
    }

    return Math.max(10, Math.min(30, waterTemp));
  }

  /**
   * Get wetsuit thickness recommendation
   */
  getWetsuitThickness(waterTemp, airTemp) {
    if (waterTemp >= 24) return 'shorty';
    if (waterTemp >= 20) return '3/2';
    if (waterTemp >= 16) return '4/3';
    if (waterTemp >= 12) return '5/4';
    return '6/5';
  }

  // Additional helper methods would be implemented here...
  // For brevity, I'm including the main structure and key methods
}

export const equipmentRecommendationEngine = new EquipmentRecommendationEngine();
export default equipmentRecommendationEngine;
