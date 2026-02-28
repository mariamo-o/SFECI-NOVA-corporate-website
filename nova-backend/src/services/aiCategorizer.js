// ============================================================
// NOVA Platform — AI Categorizer (Rule-Based w/ ML Scaffold)
// Assigns sector and category to RFQs automatically.
// Phase 4: Replace rule engine with vector embedding model.
// ============================================================
'use strict';

const logger = require('../config/logger');

// Keyword → sector mapping (deterministic in Phase 1)
const SECTOR_KEYWORDS = {
    industrial: ['machinery', 'equipment', 'construction', 'steel', 'cement', 'scaffolding', 'crane', 'pump', 'compressor', 'valve', 'pipe', 'generator', 'fabricat'],
    energy: ['solar', 'wind', 'turbine', 'transformer', 'grid', 'renewable', 'battery', 'inverter', 'photovoltaic', 'hvac', 'power station', 'substation', 'cable', 'lng'],
    medical: ['medical', 'pharmaceutical', 'hospital', 'mri', 'surgical', 'imaging', 'diagnostic', 'reagent', 'steriliz', 'ppe', 'ventilator', 'defibrillat', 'implant'],
    trading: ['agricultural', 'grain', 'wheat', 'rice', 'sugar', 'coffee', 'commodity', 'food', 'feed', 'fertilizer', 'livestock', 'seafood'],
    tech: ['software', 'iot', 'sensor', 'ai', 'server', 'datacenter', 'telecom', 'network', 'cybersecurity', 'cloud', 'saas', 'integration', 'smart city'],
    mega_projects: ['theme park', 'entertainment', 'resort', 'stadium', 'urban development', 'housing', 'infrastructure', 'city development', 'wonderworld'],
};

/**
 * Categorize an RFQ by its title + description.
 * Returns: { sector, confidence, matchedKeywords }
 */
function categorizeRFQ(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const scores = {};

    for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
        const matched = keywords.filter((kw) => text.includes(kw));
        if (matched.length > 0) {
            scores[sector] = { count: matched.length, keywords: matched };
        }
    }

    if (Object.keys(scores).length === 0) {
        return { sector: 'general', confidence: 0, matchedKeywords: [] };
    }

    // Pick highest match count
    const best = Object.entries(scores).sort((a, b) => b[1].count - a[1].count)[0];
    const [sector, data] = best;

    // Confidence: based on keyword density
    const wordCount = text.split(/\s+/).length;
    const density = data.count / Math.max(wordCount / 10, 1);
    const confidence = Math.min(Math.round(density * 40 + data.count * 15), 95);

    logger.info('AI RFQ categorization', { sector, confidence, matchedKeywords: data.keywords });

    return {
        sector,
        confidence,
        matchedKeywords: data.keywords,
        allScores: scores,
    };
}

/**
 * Scaffold for Phase 4 ML model integration.
 * Currently calls rule-based engine; replace body with:
 *   const result = await fetch(process.env.ML_INFERENCE_URL, { method:'POST', body: JSON.stringify({text}) });
 */
async function categorizeRFQWithAI(title, description) {
    // TODO Phase 4: call ML inference endpoint
    const result = categorizeRFQ(title, description);
    return {
        ...result,
        model: 'rule-based-v1',
        modelVersion: '1.0.0',
        inferenceMs: 0,
    };
}

module.exports = { categorizeRFQ, categorizeRFQWithAI };
