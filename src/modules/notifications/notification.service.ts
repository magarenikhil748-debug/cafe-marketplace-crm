export type OrderNotificationInput = {
  orderId: string
  restaurantId: string
  branchId: string
  message: string
}

export interface NotificationService {
  notifyOrderCreated(input: OrderNotificationInput): Promise<void>
  notifyOrderStatusUpdated(input: OrderNotificationInput): Promise<void>
}

export class PlaceholderNotificationService implements NotificationService {
  async notifyOrderCreated(_input: OrderNotificationInput): Promise<void> {
    return
  }

  async notifyOrderStatusUpdated(_input: OrderNotificationInput): Promise<void> {
    return
  }
}


