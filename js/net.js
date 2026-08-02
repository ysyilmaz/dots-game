const BROKERS = [
  { name: 'emqx', url: 'wss://broker.emqx.io:8084/mqtt' },
  { name: 'hivemq', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { name: 'mosquitto', url: 'wss://test.mosquitto.org:8081/mqtt' },
];

const TOPIC_PREFIX = 'dots-oyunu/v1/';
const OPEN_TIMEOUT = 8000;

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
    this.links = [];
    this.locked = null;
    this.seq = 0;
    this.lastSeq = new Map();
  }

  async connect() {
    const settled = await Promise.allSettled(BROKERS.map((b) => this.openLink(b)));
    this.links = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    for (const r of settled) {
      if (r.status === 'rejected') console.warn('broker unavailable', r.reason && r.reason.message);
    }
    if (!this.links.length) throw new Error('Hiçbir aktarım sunucusuna bağlanılamadı');
    this.handlers.onStatus?.('online');
    return this.activeName();
  }

  openLink(broker) {
    return new Promise((resolve, reject) => {
      let opened = false;
      const link = { name: broker.name, url: broker.url, client: null, alive: false };

      const client = window.mqtt.connect(broker.url, {
        clientId: this.id + '-' + broker.name,
        clean: true,
        keepalive: 30,
        connectTimeout: 6000,
        reconnectPeriod: 2000,
        protocolVersion: 4,
      });
      link.client = client;

      const timer = setTimeout(() => {
        if (opened) return;
        try { client.end(true); } catch (e) { /* ignore */ }
        reject(new Error(broker.name + ': zaman aşımı'));
      }, OPEN_TIMEOUT);

      client.on('error', (err) => {
        if (opened) {
          this.markDown(link);
          return;
        }
        clearTimeout(timer);
        try { client.end(true); } catch (e) { /* ignore */ }
        reject(new Error(broker.name + ': ' + (err && err.message ? err.message : 'hata')));
      });

      client.on('offline', () => this.markDown(link));
      client.on('close', () => this.markDown(link));
      client.on('reconnect', () => this.handlers.onStatus?.('reconnecting'));

      client.on('message', (topic, payload) => this.receive(link, payload));

      client.on('connect', () => {
        client.subscribe(this.topic, { qos: 1 }, (err) => {
          if (err) {
            if (!opened) {
              clearTimeout(timer);
              try { client.end(true); } catch (e) { /* ignore */ }
              reject(new Error(broker.name + ': abone olunamadı'));
            }
            return;
          }
          link.alive = true;
          if (opened) {
            this.handlers.onStatus?.('online');
            return;
          }
          opened = true;
          clearTimeout(timer);
          resolve(link);
        });
      });
    });
  }

  markDown(link) {
    if (!link.alive) return;
    link.alive = false;
    if (this.locked === link) this.locked = null;
    this.handlers.onStatus?.('offline');
  }

  liveLinks() {
    const live = this.links.filter((l) => l.alive);
    return live.length ? live : this.links;
  }

  activeName() {
    if (this.locked && this.locked.alive) return this.locked.name;
    const live = this.links.filter((l) => l.alive);
    return live.length ? live.map((l) => l.name).join('+') : 'bağlantı yok';
  }

  receive(link, payload) {
    let msg;
    try {
      msg = JSON.parse(payload.toString());
    } catch (e) {
      return;
    }
    if (!msg || msg.from === this.id) return;

    if (typeof msg.n === 'number') {
      const last = this.lastSeq.get(msg.from);
      if (last !== undefined && msg.n <= last) return;
      this.lastSeq.set(msg.from, msg.n);
    }

    if (this.locked !== link) {
      this.locked = link;
      this.handlers.onStatus?.('online');
    }
    this.handlers.onMessage?.(msg);
  }

  send(msg) {
    if (!this.links.length) return;
    this.seq += 1;
    const payload = JSON.stringify({ ...msg, from: this.id, n: this.seq });
    const targets = this.locked && this.locked.alive ? [this.locked] : this.liveLinks();
    for (const link of targets) {
      link.client.publish(this.topic, payload, { qos: 1 }, (err) => {
        if (err) console.warn('publish failed', link.name, msg.t, err.message);
      });
    }
  }

  close(silent) {
    if (!this.links.length) return;
    if (!silent) this.send({ t: 'bye' });
    for (const link of this.links) {
      try { link.client.end(true); } catch (e) { /* ignore */ }
    }
    this.links = [];
    this.locked = null;
  }
}
