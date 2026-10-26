import { Client } from '../types';

export function isOrderClient(client: Pick<Client, 'clientKind'>): boolean {
  return client.clientKind === 'order';
}

export function orderVendorPhone(client: Pick<Client, 'phone' | 'contacts'>): string {
  return (client.phone || client.contacts?.[0]?.phone || '').trim();
}

export function orderVendorLabel(client: Pick<Client, 'name' | 'phone' | 'contacts'>): string {
  const phone = orderVendorPhone(client);
  return phone ? `${client.name}(${phone})` : client.name;
}
