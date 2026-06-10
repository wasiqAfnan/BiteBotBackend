import { getCache, setCache, deleteCache, deleteCachePattern } from "../../utils/redisUtils.js";

const RECIPE_TTL = 3600; // 1 hour
const FEED_TTL = 3600; // 1 hour

class RecipeCacheService {
    // ==========================================
    // A. SINGLE RECIPE — DETAIL (populated)
    // ==========================================

    static async getRecipeDetail(recipeId) {
        return getCache(`recipe:${recipeId}:detail`);
    }

    static async updateRecipeDetail(recipeId, recipeData, ttl = RECIPE_TTL) {
        return setCache(`recipe:${recipeId}:detail`, recipeData, ttl);
    }

    static async invalidateRecipeDetail(recipeId) {
        return deleteCache(`recipe:${recipeId}:detail`);
    }


    // ==========================================
    // B. RECIPE REVIEWS SUMMARY
    // ==========================================

    static async getRecipeReviews(recipeId) {
        return getCache(`recipe:${recipeId}:reviews`);
    }

    static async updateRecipeReviews(recipeId, summaryData, ttl = RECIPE_TTL) {
        return setCache(`recipe:${recipeId}:reviews`, summaryData, ttl);
    }

    static async invalidateRecipeReviews(recipeId) {
        return deleteCache(`recipe:${recipeId}:reviews`);
    }

    // ==========================================
    // C. FEEDS
    // ==========================================

    // --- Trending ---
    static async getTrendingFeed(limit) {
        return getCache(`feed:trending:${limit}`);
    }

    static async updateTrendingFeed(limit, data, ttl = FEED_TTL) {
        return setCache(`feed:trending:${limit}`, data, ttl);
    }

    static async invalidateTrendingFeed(limit) {
        return deleteCache(`feed:trending:${limit}`);
    }

    // --- Fresh ---
    static async getFreshFeed(limit) {
        return getCache(`feed:fresh:${limit}`);
    }

    static async updateFreshFeed(limit, data, ttl = FEED_TTL) {
        return setCache(`feed:fresh:${limit}`, data, ttl);
    }

    static async invalidateFreshFeed(limit) {
        return deleteCache(`feed:fresh:${limit}`);
    }

    // --- Quick ---
    static async getQuickFeed(limit, maxTime) {
        return getCache(`feed:quick:${limit}:${maxTime || "all"}`);
    }

    static async updateQuickFeed(limit, maxTime, data, ttl = FEED_TTL) {
        return setCache(`feed:quick:${limit}:${maxTime || "all"}`, data, ttl);
    }

    static async invalidateQuickFeed(limit, maxTime) {
        return deleteCache(`feed:quick:${limit}:${maxTime || "all"}`);
    }

    // --- Premium ---
    static async getPremiumFeed(limit) {
        return getCache(`feed:premium:${limit}`);
    }

    static async updatePremiumFeed(limit, data, ttl = FEED_TTL) {
        return setCache(`feed:premium:${limit}`, data, ttl);
    }

    static async invalidatePremiumFeed(limit) {
        return deleteCache(`feed:premium:${limit}`);
    }

    // --- Recommended ---
    static async getRecommendedFeed(userId, limit) {
        return getCache(`feed:recommended:${userId}:${limit}`);
    }

    static async updateRecommendedFeed(userId, limit, data, ttl = FEED_TTL) {
        return setCache(`feed:recommended:${userId}:${limit}`, data, ttl);
    }

    static async invalidateRecommendedFeed(userId, limit) {
        return deleteCache(`feed:recommended:${userId}:${limit}`);
    }

    // --- Trending Premium ---
    static async getTrendingPremiumFeed(limit) {
        return getCache(`feed:trending:premium:${limit}`);
    }

    static async updateTrendingPremiumFeed(limit, data, ttl = FEED_TTL) {
        return setCache(`feed:trending:premium:${limit}`, data, ttl);
    }

    static async invalidateTrendingPremiumFeed(limit) {
        return deleteCache(`feed:trending:premium:${limit}`);
    }

    // ==========================================
    // D. BULK INVALIDATION HELPERS
    // ==========================================

    static async invalidateRecipeAllKeys(recipeId) {
        await Promise.all([
            RecipeCacheService.invalidateRecipeDetail(recipeId),
            RecipeCacheService.invalidateRecipeReviews(recipeId),
        ]);
    }

    static async invalidateAllFeeds() {
        // Use pattern deletion to clear feeds across all limit variations
        await Promise.all([
            deleteCachePattern("feed:trending:*"),
            deleteCachePattern("feed:fresh:*"),
            deleteCachePattern("feed:quick:*"),
            deleteCachePattern("feed:premium:*"),
            deleteCachePattern("feed:trending:premium:*"),
        ]);
    }
}

export default RecipeCacheService;
