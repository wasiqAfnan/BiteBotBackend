import test, { beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const mockState = {
    dbPing: async () => ({ ok: 1 }),
    redisPing: async () => "PONG",
    qdrantGetCollections: async () => ({ collections: [] }),
    connectToCloudinary: async () => ({ ok: true }),
};

globalThis.__healthCheckMocks = {
    mongoose: {
        connection: {
            db: {
                admin: () => ({
                    ping: (...args) => mockState.dbPing(...args),
                }),
            },
        },
    },
    redisClient: {
        ping: (...args) => mockState.redisPing(...args),
    },
    qdrantClient: {
        getCollections: (...args) => mockState.qdrantGetCollections(...args),
    },
    connectToCloudinary: (...args) => mockState.connectToCloudinary(...args),
};

registerHooks({
    resolve(specifier, context, nextResolve) {
        const mockUrls = {
            mongoose: "mock:mongoose",
            "../configs/redis.config.js": "mock:redis-config",
            "../services/vectorService.js": "mock:vector-service",
            "../utils/index.js": "mock:utils-index",
            "../utils/sendMail.js": "mock:send-mail",
            "../configs/queue.config.js": "mock:queue-config",
        };

        if (mockUrls[specifier]) {
            return {
                url: mockUrls[specifier],
                shortCircuit: true,
            };
        }

        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        const sources = {
            "mock:mongoose": `
                export default globalThis.__healthCheckMocks.mongoose;
            `,
            "mock:redis-config": `
                export default globalThis.__healthCheckMocks.redisClient;
            `,
            "mock:vector-service": `
                export const qdrantClient = globalThis.__healthCheckMocks.qdrantClient;
            `,
            "mock:utils-index": `
                export class ApiError extends Error {}
                export class ApiResponse {
                    constructor(statusCode, message = "Success", data = null) {
                        this.success = true;
                        this.statusCode = statusCode;
                        this.message = message.toString();
                        this.data = data;
                    }
                }
                export const connectToCloudinary = (...args) =>
                    globalThis.__healthCheckMocks.connectToCloudinary(...args);
            `,
            "mock:send-mail": `
                export default async function sendMail() {
                    return undefined;
                }
            `,
            "mock:queue-config": `
                export const connection = null;
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

const {
    handleCloudinaryPing,
    handleDbPing,
    handleHealthCheck,
    handleQdrantPing,
    handleRedisPing,
} = await import("../src/controllers/healthCheck.controller.js");

const mockRequest = (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
});

const mockResponse = () => ({
    statusCode: undefined,
    body: undefined,
    statusCalls: [],
    jsonCalls: [],
    status(code) {
        this.statusCode = code;
        this.statusCalls.push(code);
        return this;
    },
    json(payload) {
        this.body = payload;
        this.jsonCalls.push(payload);
        return this;
    },
});

const invokeController = async (controller, req = mockRequest()) => {
    const res = mockResponse();
    await controller(req, res);
    return res;
};

const assertApiResponse = (payload, expected) => {
    assert.ok(payload);
    assert.equal(payload.success, true);
    assert.equal(payload.statusCode, expected.statusCode);
    assert.equal(payload.message, expected.message);

    if ("data" in expected) {
        assert.deepEqual(payload.data, expected.data);
    }
};

beforeEach(() => {
    mockState.dbPing = async () => ({ ok: 1 });
    mockState.redisPing = async () => "PONG";
    mockState.qdrantGetCollections = async () => ({ collections: [] });
    mockState.connectToCloudinary = async () => ({ ok: true });
});

describe("handleHealthCheck", () => {
    test("returns 200 with server health ApiResponse", async () => {
        const res = await invokeController(handleHealthCheck);

        assert.equal(res.statusCode, 200);
        assertApiResponse(res.body, {
            statusCode: 200,
            message: "Server is up and running",
            data: null,
        });
    });
});

describe("handleDbPing", () => {
    test("returns 200 with MongoDB ping result", async () => {
        const pingResult = { ok: 1 };
        mockState.dbPing = async () => pingResult;

        const res = await invokeController(handleDbPing);

        assert.equal(res.statusCode, 200);
        assertApiResponse(res.body, {
            statusCode: 200,
            message: "DB is up and running",
            data: pingResult,
        });
    });

    test("returns 500 when MongoDB ping fails", async () => {
        mockState.dbPing = async () => {
            throw new Error("mongo unavailable");
        };

        const res = await invokeController(handleDbPing);

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, "DB ping failed");
    });
});

describe("handleRedisPing", () => {
    test("returns 200 with Redis PONG payload", async () => {
        mockState.redisPing = async () => "PONG";

        const res = await invokeController(handleRedisPing);

        assert.equal(res.statusCode, 200);
        assertApiResponse(res.body, {
            statusCode: 200,
            message: "Redis is up and running",
            data: { ping: "PONG" },
        });
        assert.equal(res.body.data.ping, "PONG");
    });

    test("returns 500 with error message when Redis ping fails", async () => {
        mockState.redisPing = async () => {
            throw new Error("redis unavailable");
        };

        const res = await invokeController(handleRedisPing);

        assert.equal(res.statusCode, 500);
        assertApiResponse(res.body, {
            statusCode: 500,
            message: "Redis ping failed",
            data: { error: "redis unavailable" },
        });
        assert.match(res.body.data.error, /redis unavailable/);
    });
});

describe("handleQdrantPing", () => {
    test("returns 200 with Qdrant collection health payload", async () => {
        const collectionData = {
            collections: [{ name: "recipes" }],
        };
        mockState.qdrantGetCollections = async () => collectionData;

        const res = await invokeController(handleQdrantPing);

        assert.equal(res.statusCode, 200);
        assertApiResponse(res.body, {
            statusCode: 200,
            message: "Qdrant is up and running",
            data: { health: collectionData },
        });
    });

    test("returns 500 with error message when Qdrant ping fails", async () => {
        mockState.qdrantGetCollections = async () => {
            throw new Error("qdrant unavailable");
        };

        const res = await invokeController(handleQdrantPing);

        assert.equal(res.statusCode, 500);
        assertApiResponse(res.body, {
            statusCode: 500,
            message: "Qdrant ping failed",
            data: { error: "qdrant unavailable" },
        });
        assert.match(res.body.data.error, /qdrant unavailable/);
    });
});

describe("handleCloudinaryPing", () => {
    test("returns 200 when Cloudinary ping succeeds", async () => {
        let wasCalled = false;
        mockState.connectToCloudinary = async () => {
            wasCalled = true;
            return { ok: true };
        };

        const res = await invokeController(handleCloudinaryPing);

        assert.equal(res.statusCode, 200);
        assert.equal(wasCalled, true);
        assertApiResponse(res.body, {
            statusCode: 200,
            message: "Cloudinary is up and running",
            data: null,
        });
    });

    test("returns 500 with error message when Cloudinary ping fails", async () => {
        mockState.connectToCloudinary = async () => {
            throw new Error("cloudinary unavailable");
        };

        const res = await invokeController(handleCloudinaryPing);

        assert.equal(res.statusCode, 500);
        assertApiResponse(res.body, {
            statusCode: 500,
            message: "Cloudinary ping failed",
            data: { error: "cloudinary unavailable" },
        });
        assert.match(res.body.data.error, /cloudinary unavailable/);
    });
});
