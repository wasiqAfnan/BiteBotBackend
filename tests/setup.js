import { registerHooks } from "node:module";
import mongoose from "mongoose";

const cacheStore = new Map();

if (!Object.getOwnPropertyDescriptor(mongoose.Document.prototype, "likeCount")) {
    Object.defineProperty(mongoose.Document.prototype, "likeCount", {
        configurable: true,
        get() {
            if (this.constructor?.modelName !== "Recipe") return undefined;
            if (!this.likes) this.likes = [];
            return this.likes;
        },
        set(value) {
            if (this.constructor?.modelName === "Recipe") {
                this.likes = value;
            }
        },
    });
}

globalThis.__bitezzyTestMocks ??= {
    recipeQueue: {
        jobs: [],
        async add(name, data, options) {
            const job = { name, data, options };
            this.jobs.push(job);
            return job;
        },
    },
    redisClient: {
        isOpen: false,
        isReady: false,
        async connect() {},
        on() {},
        multi() {
            return {
                set() {
                    return this;
                },
                incr() {
                    return this;
                },
                async exec() {
                    return ["OK", 1];
                },
            };
        },
        async get(key) {
            return cacheStore.get(String(key)) ?? null;
        },
        async set(key, value) {
            cacheStore.set(String(key), value);
            return "OK";
        },
        async del(key) {
            return cacheStore.delete(String(key)) ? 1 : 0;
        },
    },
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        const mocks = {
            "../src/configs/redis.config.js": "mock:bitezzy-redis-config",
            "../src/configs/queue.config.js": "mock:bitezzy-queue-config",
            "../src/services/vectorService.js": "mock:bitezzy-vector-service",
            "../src/utils/redisUtils.js": "mock:bitezzy-redis-utils",
            "../src/services/cache/user.cache.js": "mock:bitezzy-user-cache",
            "../src/utils/sendMail.js": "mock:bitezzy-send-mail",
            "../src/utils/index.js": "mock:bitezzy-utils-index",
            "../configs/redis.config.js": "mock:bitezzy-redis-config",
            "../configs/queue.config.js": "mock:bitezzy-queue-config",
            "../services/vectorService.js": "mock:bitezzy-vector-service",
            "../utils/redisUtils.js": "mock:bitezzy-redis-utils",
            "../services/cache/user.cache.js": "mock:bitezzy-user-cache",
            "../utils/sendMail.js": "mock:bitezzy-send-mail",
            "../utils/index.js": "mock:bitezzy-utils-index",
        };

        if (mocks[specifier]) {
            return {
                url: mocks[specifier],
                shortCircuit: true,
            };
        }

        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        const sources = {
            "mock:bitezzy-redis-config": `
                export default globalThis.__bitezzyTestMocks.redisClient;
            `,
            "mock:bitezzy-queue-config": `
                export const connection = {};
                export const recipeQueue = globalThis.__bitezzyTestMocks.recipeQueue;
            `,
            "mock:bitezzy-vector-service": `
                export const qdrantClient = {
                    getCollections: async () => ({ collections: [] }),
                };
                export async function similaritySearch(query, limit) {
                    return (process.env.TEST_SIMILARITY_IDS || "")
                        .split(",")
                        .map((id) => id.trim())
                        .filter(Boolean)
                        .slice(0, limit)
                        .map((id) => ({ id }));
                }
            `,
            "mock:bitezzy-redis-utils": `
                const store = new Map();
                export async function getCache(key) {
                    return store.get(String(key)) ?? null;
                }
                export async function setCache(key, value) {
                    store.set(String(key), value);
                    return true;
                }
                export async function deleteCache(key) {
                    return store.delete(String(key));
                }
            `,
            "mock:bitezzy-user-cache": `
                export default class UserCacheService {
                    static async getProfile() { return null; }
                    static async updateProfile() { return true; }
                    static async invalidateProfile() { return true; }
                    static async getSubscriptions() { return null; }
                    static async updateSubscriptions() { return true; }
                    static async invalidateSubscriptions() { return true; }
                    static async getChefSubscribers() { return null; }
                    static async updateChefSubscribers() { return true; }
                    static async invalidateChefSubscribers() { return true; }
                    static async getFavourites() { return null; }
                    static async updateFavourites() { return true; }
                    static async invalidateFavourites() { return true; }
                    static async getReviewsGiven() { return null; }
                    static async updateReviewsGiven() { return true; }
                    static async invalidateReviewsGiven() { return true; }
                    static async getChefRecipes() { return null; }
                    static async updateChefRecipes() { return true; }
                    static async invalidateChefRecipes() { return true; }
                    static async getChefReviewSummary() { return null; }
                    static async updateChefReviewSummary() { return true; }
                    static async invalidateChefReviewSummary() { return true; }
                    static async getPreferences() { return null; }
                    static async updatePreferences() { return true; }
                    static async invalidatePreferences() { return true; }
                }
            `,
            "mock:bitezzy-send-mail": `
                export default async function sendMail() {
                    return { id: "test-mail" };
                }
            `,
            "mock:bitezzy-utils-index": `
                export class ApiError extends Error {
                    constructor(statusCode = 500, message = "Operation Failed", data = null) {
                        if (typeof statusCode === "string" && typeof message === "number") {
                            [statusCode, message] = [message, statusCode];
                        }
                        super(message);
                        this.success = false;
                        this.statusCode = Number(statusCode);
                        this.data = data;
                    }
                }
                export class ApiResponse {
                    constructor(statusCode, message = "Success", data = null) {
                        this.success = true;
                        this.statusCode = statusCode;
                        this.message = message.toString();
                        this.data = data;
                    }
                }
                export async function uploadImageToCloud() {
                    return {
                        public_id: "uploaded-image",
                        secure_url: "https://cdn.bitezzy.test/uploaded-image.png",
                    };
                }
                export async function deleteLocalFile() {}
                export async function deleteLocalFiles() {}
                export async function deleteCloudFile() {
                    return true;
                }
                export async function connectToCloudinary() {
                    return { ok: true };
                }
            `,
        };

        if (sources[url]) {
            return {
                format: "module",
                source: sources[url],
                shortCircuit: true,
            };
        }

        return nextLoad(url, context);
    },
});
