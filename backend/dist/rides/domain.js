export class ApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export function assertTransition(current, next) {
    const allowed = { REQUESTED: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['CANCELLED', 'COMPLETED'], CANCELLED: [], COMPLETED: [] };
    if (!allowed[current].includes(next))
        throw new ApiError(409, 'INVALID_TRANSITION', `Cannot change ${current.toLowerCase()} ride to ${next.toLowerCase()}.`);
}
export function estimate(category) {
    return { farePaisa: category === 'COMFORT' ? 78000 : 48000, etaMinutes: category === 'COMFORT' ? 6 : 4 };
}
