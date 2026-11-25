import { createMotionFunction } from '../../server/src/vercel/motionFunction.js';

// Node.js is the Vercel default. No app.listen(), Express instance or provider initialization.
export const POST = createMotionFunction();
