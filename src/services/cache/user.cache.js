import { getCache, setCache, deleteCache } from "../../utils/redisUtils.js";

const DEFAULT_TTL = 3600; // 1 hour

class UserCacheService {
    // ==========================================
    // A. CORE PROFILE
    // ==========================================
    static async getProfile(userId) {
        return await getCache(`user:${userId}:profile`);
    }

    static async updateProfile(userId, profileData, ttl = DEFAULT_TTL) {
        // Strip sensitive data before caching
        let safeProfile = profileData;
        if (profileData && typeof profileData === "object") {
            safeProfile = typeof profileData.toObject === "function" ? profileData.toObject() : { ...profileData };
            delete safeProfile.password;
            delete safeProfile.refreshToken;
            delete safeProfile.forgotPasswordToken;
            delete safeProfile.forgotPasswordExpiry;
            if (safeProfile.chefProfile?.reviews) {
                safeProfile = {
                    ...safeProfile,
                    chefProfile: { ...safeProfile.chefProfile, reviews: undefined },
                };
            }
        }
        return setCache(`user:${userId}:profile`, safeProfile, ttl);
    }

    static async invalidateProfile(userId) {
        return await deleteCache(`user:${userId}:profile`);
    }

    // ==========================================
    // B. SOCIAL CONNECTIONS
    // ==========================================
    static async getSubscriptions(userId) {
        return await getCache(`user:${userId}:subscriptions`);
    }

    static async updateSubscriptions(userId, subscriptionsData, ttl = DEFAULT_TTL) {
        return await setCache(`user:${userId}:subscriptions`, subscriptionsData, ttl);
    }

    static async invalidateSubscriptions(userId) {
        return await deleteCache(`user:${userId}:subscriptions`);
    }

    static async getChefSubscribers(chefId) {
        return await getCache(`chef:${chefId}:subscribers`);
    }

    static async updateChefSubscribers(chefId, subscribersData, ttl = DEFAULT_TTL) {
        return await setCache(`chef:${chefId}:subscribers`, subscribersData, ttl);
    }

    static async invalidateChefSubscribers(chefId) {
        return await deleteCache(`chef:${chefId}:subscribers`);
    }

    // ==========================================
    // C. CONTENT & ENGAGEMENT
    // ==========================================
    static async getFavourites(userId) {
        return await getCache(`user:${userId}:favourites`);
    }

    static async updateFavourites(userId, favouritesData, ttl = DEFAULT_TTL) {
        return await setCache(`user:${userId}:favourites`, favouritesData, ttl);
    }

    static async invalidateFavourites(userId) {
        return await deleteCache(`user:${userId}:favourites`);
    }

    static async getReviewsGiven(userId) {
        return await getCache(`user:${userId}:reviews_given`);
    }

    static async updateReviewsGiven(userId, reviewsData, ttl = DEFAULT_TTL) {
        return await setCache(`user:${userId}:reviews_given`, reviewsData, ttl);
    }

    static async invalidateReviewsGiven(userId) {
        return await deleteCache(`user:${userId}:reviews_given`);
    }

    static async getChefRecipes(chefId) {
        return await getCache(`chef:${chefId}:recipes`);
    }

    static async updateChefRecipes(chefId, recipesData, ttl = DEFAULT_TTL) {
        return await setCache(`chef:${chefId}:recipes`, recipesData, ttl);
    }

    static async invalidateChefRecipes(chefId) {
        return await deleteCache(`chef:${chefId}:recipes`);
    }

    static async getChefReviews(chefId) {
        return await getCache(`chef:${chefId}:reviews:summary`);
    }

    static async updateChefReviews(chefId, summaryData, ttl = DEFAULT_TTL) {
        return await setCache(`chef:${chefId}:reviews:summary`, summaryData, ttl);
    }

    static async invalidateChefReviews(chefId) {
        return await deleteCache(`chef:${chefId}:reviews:summary`);
    }

    // ==========================================
    // D. PERSONALIZATION / ML PREFERENCES
    // ==========================================
    static async getPreferences(userId) {
        return await getCache(`user:${userId}:preferences`);
    }

    static async updatePreferences(userId, preferencesData, ttl = DEFAULT_TTL) {
        return await setCache(`user:${userId}:preferences`, preferencesData, ttl);
    }

    static async invalidatePreferences(userId) {
        return await deleteCache(`user:${userId}:preferences`);
    }
}

export default UserCacheService;
