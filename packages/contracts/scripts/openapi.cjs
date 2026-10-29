const { z } = require('zod');
const {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} = require('@asteasolutions/zod-to-openapi');
const SwaggerParser = require('@apidevtools/swagger-parser');
// The generator must extend Zod before schemas are constructed in this CLI process.
extendZodWithOpenApi(z);
const {
  healthContract,
  readinessContract,
  apiErrorSchema,
  catalogContracts,
} = require('@frame/contracts');

function generateOpenApi() {
  const registry = new OpenAPIRegistry();
  const health = registry.register('HealthResponse', healthContract.response);
  const ready = registry.register(
    'ReadinessResponse',
    readinessContract.response,
  );
  const error = registry.register('ApiError', apiErrorSchema);
  registry.register('RequestId', apiErrorSchema.shape.error.shape.requestId);
  const cache = {
    'Cache-Control': {
      description: 'Responses are never cached.',
      schema: { type: 'string', const: 'no-store' },
    },
  };
  const errorResponse = (description) => ({
    description,
    headers: {
      ...cache,
      'X-Request-Id': { schema: { $ref: '#/components/schemas/RequestId' } },
    },
    content: { 'application/json': { schema: error } },
  });
  // This documents unmatched URLs without inventing a concrete route.
  registry.registerComponent('responses', 'NotFound', {
    ...errorResponse('Unmatched API route: HTTP 404, code NOT_FOUND.'),
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
    },
  });
  for (const [contract, schema] of [
    [healthContract, health],
    [readinessContract, ready],
  ]) {
    registry.registerPath({
      method: contract.method,
      path: contract.path,
      operationId: contract.operationId,
      responses: {
        200: {
          description:
            contract === healthContract
              ? 'Process liveness.'
              : 'Actual PostgreSQL connectivity (not migration status).',
          headers: cache,
          content: { 'application/json': { schema } },
        },
        ...(contract === readinessContract
          ? {
              503: errorResponse(
                'Database missing/unavailable: code HTTP_ERROR, message Service Unavailable.',
              ),
            }
          : {}),
        500: errorResponse(
          'Unexpected failure: code INTERNAL_ERROR. No internal exception details.',
        ),
      },
    });
  }
  for (const contract of Object.values(catalogContracts)) {
    registry.registerPath({
      method: contract.method,
      path: contract.path,
      operationId: contract.operationId,
      description:
        contract === catalogContracts.trending
          ? 'Weekly by default. Only page 1 is accepted provisionally; multi-page support is UNVERIFIED. Totals are provider-reported and do not imply additional pages are requestable.'
          : contract === catalogContracts.popular
            ? 'Pages 1–500; totals capped to 500 pages / 10000 results.'
            : undefined,
      request: {
        query: contract.query,
        ...('params' in contract ? { params: contract.params } : {}),
      },
      responses: {
        200: {
          description: 'Normalized FRAME catalog data.',
          headers: cache,
          content: { 'application/json': { schema: contract.response } },
        },
        400: errorResponse('Invalid or unsupported input: VALIDATION_ERROR.'),
        ...('params' in contract
          ? { 404: errorResponse('Movie absent: NOT_FOUND.') }
          : {}),
        429: errorResponse('Provider rate limit: RATE_LIMITED.'),
        502: errorResponse(
          'Invalid upstream response, network or server failure: CATALOG_UNAVAILABLE.',
        ),
        503: errorResponse(
          'Provider disabled, authentication failure or deadline: CATALOG_UNAVAILABLE.',
        ),
        500: errorResponse('Unexpected internal failure: INTERNAL_ERROR.'),
      },
    });
  }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'FRAME API', version: '1.0.0' },
  });
}

async function checkOpenApi() {
  const document = generateOpenApi();
  // Validate structure/references without permitting network reference resolution.
  await SwaggerParser.validate(structuredClone(document), {
    resolve: { external: false },
  });
  if (JSON.stringify(document) !== JSON.stringify(generateOpenApi()))
    throw new Error('Nondeterministic OpenAPI generation');
  return document;
}

if (require.main === module) {
  checkOpenApi()
    .then((document) => {
      if (!process.argv.includes('--check')) {
        const { mkdirSync, writeFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const directory = resolve(__dirname, '../../../tmp/openapi');
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          resolve(directory, 'frame-api.json'),
          JSON.stringify(document, null, 2) + '\n',
        );
      }
      console.log('OpenAPI 3.1 generation, validation and determinism passed.');
    })
    .catch(() => {
      console.error('OpenAPI validation failed.');
      process.exitCode = 1;
    });
}

module.exports = { generateOpenApi, checkOpenApi };
