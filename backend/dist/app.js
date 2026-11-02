import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { body, header, param, query, validationResult, matchedData } from 'express-validator';
import { ApiError, estimate } from './rides/domain.js';
import { RideService } from './rides/service.js';
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the request fields.', details: errors.array().map(e => ({ field: e.type === 'field' ? e.path : 'request', message: e.msg })) } });
        return;
    }
    next();
};
export function createApp(db, logging = true) {
    const app = express();
    const service = new RideService(db);
    app.disable('x-powered-by');
    app.use(helmet());
    if (logging)
        app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'], serializers: { req: req => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }) } }));
    app.use(express.json({ limit: '16kb' }));
    app.get('/api/health', async (_req, res) => { await db.query('SELECT 1'); res.json({ status: 'ok' }); });
    app.get('/api/drivers', async (_req, res) => { res.json(await service.drivers()); });
    app.get('/api/quotes', query('category').isIn(['ECONOMY', 'COMFORT']), validate, (req, res) => { res.json(estimate(req.query.category)); });
    app.post('/api/rides', header('Idempotency-Key').isUUID().withMessage('A UUID Idempotency-Key header is required.'), body('riderId').isUUID(), body('pickup').isString().bail().trim().isLength({ min: 2, max: 200 }), body('destination').isString().bail().trim().isLength({ min: 2, max: 200 }).custom((value, { req }) => value.toLowerCase() !== String(req.body.pickup).toLowerCase()).withMessage('Destination must differ from pickup.'), body('category').isIn(['ECONOMY', 'COMFORT']), validate, async (req, res) => {
        const input = matchedData(req, { locations: ['body'] });
        const result = await service.create(input, req.get('Idempotency-Key'));
        res.status(result.replayed ? 200 : 201).json(result.ride);
    });
    app.get('/api/rides/:id', param('id').isUUID(), validate, async (req, res) => { res.json(await service.get(String(req.params.id))); });
    for (const [action, status] of [['accept', 'ACCEPTED'], ['cancel', 'CANCELLED'], ['complete', 'COMPLETED']]) {
        app.post(`/api/rides/:id/${action}`, param('id').isUUID(), ...(action === 'accept' ? [body('driverId').isUUID()] : []), validate, async (req, res) => { res.json(await service.transition(String(req.params.id), status, req.body?.driverId)); });
    }
    app.use((_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }); });
    const errors = (error, req, res, _next) => {
        if (error instanceof ApiError) {
            res.status(error.status).json({ error: { code: error.code, message: error.message } });
            return;
        }
        if (error.type === 'entity.parse.failed') {
            res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
            return;
        }
        if (error.type === 'entity.too.large') {
            res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
            return;
        }
        req.log?.error({ err: error }, 'Request failed');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
    };
    app.use(errors);
    return app;
}
