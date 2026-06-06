import { Router, Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { CheckoutSchema } from './dto/checkout.dto';
import { authenticate } from '../shared/middleware/authenticate';
import { verifyStripeSignature } from '../shared/middleware/stripe-webhook';

const router = Router();
const paymentsService = new PaymentsService();

router.post('/checkout', authenticate, async (req: Request, res: Response) => {
  const dto = CheckoutSchema.parse(req.body);
  const result = await paymentsService.createCheckoutSession(req.user!.id, dto.priceId);

  if (result.isErr()) {
    return res.status(400).json({ error: result.error.message });
  }

  return res.json({ url: result.value.url });
});

router.post('/cancel', authenticate, async (req: Request, res: Response) => {
  const result = await paymentsService.cancelSubscription(req.user!.id);

  if (result.isErr()) {
    return res.status(400).json({ error: result.error.message });
  }

  return res.json({ message: 'Subscription cancelled at period end' });
});

router.get('/invoices', authenticate, async (req: Request, res: Response) => {
  const invoices = await paymentsService.getInvoices(req.user!.id);
  return res.json({ invoices });
});

router.post('/webhooks/stripe', verifyStripeSignature, async (req: Request, res: Response) => {
  await paymentsService.handleWebhook(req.body);
  return res.status(200).json({ received: true });
});

export { router as paymentsRouter };
