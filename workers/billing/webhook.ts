interface StripeEvent {
  id?: string;
  type?: string;
  livemode?: boolean;
  data?: {object?: {object?:string; id?:string; livemode?:boolean; metadata?:{racion_uid?:string}}};
}

const encoder = new TextEncoder();

export async function signedNotification(raw: string, signature: string, secret: string, now = Date.now()) {
  const parts = signature.split(',').map(field => field.trim().split('='));
  const timestamps = parts.filter(([name]) => name === 't');
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0][1])) throw new Error('invalid_signature');
  const timestamp = timestamps[0][1];
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) throw new Error('stale_signature');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify']);
  const signed = encoder.encode(timestamp + '.' + raw);
  let verified = false;
  for (const [kind, hex] of parts) {
    if (kind !== 'v1' || !/^[a-fA-F0-9]{64}$/.test(hex)) continue;
    const bytes = Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, signed)) { verified = true; break; }
  }
  if (!verified) throw new Error('invalid_signature');
  const event = JSON.parse(raw) as StripeEvent;
  if (event.livemode !== false || typeof event.id !== 'string' || !event.id.startsWith('evt_')) {
    throw new Error('invalid_test_event');
  }
  const object = event.data?.object;
  const uid = object?.metadata?.racion_uid;
  if (typeof uid !== 'string' || !uid || uid.length > 128 || object.livemode !== false) return null;
  if (event.type === 'checkout.session.completed' && object.object === 'checkout.session' &&
      typeof object.id === 'string' && /^cs_test_[A-Za-z0-9_]+$/.test(object.id)) {
    return {uid, sessionId:object.id};
  }
  const chargeEvents = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.processing'];
  if (chargeEvents.includes(event.type ?? '') && object.object === 'payment_intent' &&
      typeof object.id === 'string' && /^pi_[A-Za-z0-9_]+$/.test(object.id)) return {uid, intentId:object.id};
  return null;
}
