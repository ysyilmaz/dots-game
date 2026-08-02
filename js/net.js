const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const TOPIC_PREFIX = 'dots-oyunu/v1/';

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

function clientId() {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return 'dg-' + Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class Net {
  constructor(room, handlers) {
    this.room = room;
    this.topic = TOPIC_PREFIX + room;
    this.id = clientId();
    this.handlers = handlers;
    this.client = null;
    this.broker = null;
  }

  async connect() {
    for (const url of BROKERS) {
      try {
        await this.tryBroker(url);
        this.broker = url;
        return url;
      } catch (err) {
        console.warn('broker unavailable', url, err && err.message);
      }
    }
    throw new Error('Hiçbir aktarım sunucusuna bağlanılamadı');
  }

  tryBroker(url) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const client = window.mqtt.connect(url, {
        clientId: this.id,
        clean: true,
        keepalive: 30,
        connectTimeout: 6000,
        reconnectPeriod: 0,
        protocolVersion: 4,
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { client.end(true); } catch (e) { /* ignore */ }
        reject(new Error('zaman aşımı'));
      }, 8000);

      client.on('error', (err) => {
        if (settled) {
          this.handlers.onStatus?.('error');
          return;
        }
        settled = true;
        clearTimeout(timer);
        try { client.end(true); } catch (e) { /* ignore */ }
        reject(err);
      });

      client.on('connect', () => {
        if (settled) return;
        client.subscribe(this.topic, { qos: 1 }, (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (err) {
            try { client.end(true); } catch (e2) { /* ignore */ }
            reject(err);
            return;
          }
          client.options.reconnectPeriod = 2000;
          this.client = client;
          client.on('message', (topic, payload) => this.receive(payload));
          client.on('reconnect', () => this.handlers.onStatus?.('reconnecting'));
          client.on('offline', () => this.handlers.onStatus?.('offline'));
          this.handlers.onStatus?.('online');
          resolve();
        });
      });
    });
  }

  receive(payload) {
    let msg;
    try {
      msg = JSON.parse(payload.toString());
    } catch (e) {
      return;
    }
    if (!msg || msg.from === this.id) return;
    this.handlers.onMessage?.(msg);
  }

  send(msg) {
    if (!this.client) return;
    this.client.publish(this.topic, JSON.stringify({ ...msg, from: this.id }), { qos: 1 });
  }

  close() {
    if (!this.client) return;
    try {
      this.send({ t: 'bye' });
      this.client.end(true);
    } catch (e) { /* ignore */ }
    this.client = null;
  }
}
