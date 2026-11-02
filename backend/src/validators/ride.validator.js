import { body, param, query } from 'express-validator';
export const rideIdRules = () => [
  param('id').isUUID().withMessage('Ride ID must be a UUID.').toLowerCase(),
];
export const acceptRules = () => [
  ...rideIdRules(),
  body('driverId')
    .isUUID()
    .withMessage('Driver ID must be a UUID.')
    .toLowerCase(),
];
export const quoteRules = () => [
  query('category').isIn(['ECONOMY', 'COMFORT']),
];
export const createRules = () => [
  ...rideIdRules(),
  body('riderId')
    .isUUID()
    .withMessage('Rider ID must be a UUID.')
    .toLowerCase(),
  body('pickup')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Pickup must be 2 to 200 characters.'),
  body('destination')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Destination must be 2 to 200 characters.')
    .bail()
    .custom(
      (value, { req }) =>
        value.toLowerCase() !== String(req.body.pickup).toLowerCase(),
    )
    .withMessage('Destination must differ from pickup.'),
  body('category')
    .isIn(['ECONOMY', 'COMFORT'])
    .withMessage('Choose Economy or Comfort.'),
];
