import { ApiError } from '../shared/api-error.js';
export const notFound = (_req, res) => {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
};
export const errorHandler = (error, req, res, _next) => {
  if (error instanceof ApiError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
    });
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large.',
      },
    });
    return;
  }
  req.log?.error({ err: error }, 'Request failed');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    },
  });
};
