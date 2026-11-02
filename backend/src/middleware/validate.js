import { validationResult } from 'express-validator';
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the request fields.',
        details: errors.array().map((e) => ({
          field: e.type === 'field' ? e.path : 'request',
          message: e.msg,
        })),
      },
    });
    return;
  }
  next();
};
