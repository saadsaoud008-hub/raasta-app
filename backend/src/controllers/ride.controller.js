import { matchedData } from 'express-validator';
import { estimate } from '../services/ride-rules.js';
export class RideController {
  service;
  constructor(service) {
    this.service = service;
  }
  create = async (req, res) => {
    const input = matchedData(req, { locations: ['body'] });
    const result = await this.service.create(input, String(req.params.id));
    if (!result.replayed) res.location(`/api/rides/${result.ride.id}`);
    res.status(result.replayed ? 200 : 201).json(result.ride);
  };
  get = async (req, res) => {
    res.json(await this.service.get(String(req.params.id)));
  };
  accept = async (req, res) => {
    res.json(
      await this.service.transition(
        String(req.params.id),
        'ACCEPTED',
        req.body.driverId,
      ),
    );
  };
  cancel = async (req, res) => {
    res.json(await this.service.transition(String(req.params.id), 'CANCELLED'));
  };
  complete = async (req, res) => {
    res.json(await this.service.transition(String(req.params.id), 'COMPLETED'));
  };
  quote = (req, res) => {
    res.json(estimate(req.query.category));
  };
  drivers = async (_req, res) => {
    res.json(await this.service.drivers());
  };
}
