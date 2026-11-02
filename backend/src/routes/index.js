import { Router } from 'express';
import { RideController } from '../controllers/ride.controller.js';
import { RideService } from '../services/ride.service.js';
import {
  acceptRules,
  createRules,
  quoteRules,
  rideIdRules,
} from '../validators/ride.validator.js';
import { validate } from '../middleware/validate.js';
export function createApiRouter(db, driverCache, broker, updates) {
  const router = Router(),
    controller = new RideController(new RideService(db, driverCache, broker, updates));
  router.get('/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  router.get('/drivers', controller.drivers);
  router.get('/quotes', quoteRules(), validate, controller.quote);
  router.put('/rides/:id', createRules(), validate, controller.create);
  router.get('/rides/:id', rideIdRules(), validate, controller.get);
  router.post('/rides/:id/accept', acceptRules(), validate, controller.accept);
  router.post('/rides/:id/cancel', rideIdRules(), validate, controller.cancel);
  router.post(
    '/rides/:id/complete',
    rideIdRules(),
    validate,
    controller.complete,
  );
  return router;
}
