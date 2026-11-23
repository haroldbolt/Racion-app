import { handleBilling, type BillingWorkerEnv } from './http';
export { BillingAccount } from './account';

export default {
  fetch(request: Request, env: BillingWorkerEnv) {
    return handleBilling(request, env);
  },
};
