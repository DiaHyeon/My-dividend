// ระบบส่งสัญญาณแจ้งเตือนการเปลี่ยนแปลงข้อมูลพอร์ตการลงทุน (Event Bus) ข้ามหน้าจอแบบ Real-time โดยไม่ต้อง Unmount หน้าจอ
type EventCallback = () => void;

class PortfolioEventEmitter {
  private listeners: Set<EventCallback> = new Set();

  /**
   * สมัครรับฟัง Event เมื่อมีการเปลี่ยนแปลงข้อมูลพอร์ต
   * @param callback ฟังก์ชันที่จะทำงานเมื่อข้อมูลมีการเปลี่ยนแปลง
   * @returns ฟังก์ชันสำหรับยกเลิกการรับฟัง (Unsubscribe)
   */
  subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * ส่งสัญญาณแจ้งเตือนทุกหน้าจอที่กำลัง Mount อยู่ให้รีเฟรชข้อมูลใหม่
   */
  emitRefresh(): void {
    this.listeners.forEach((callback) => {
      try {
        callback();
      } catch (err) {
        console.warn('[PortfolioEventEmitter] Error executing listener callback:', err);
      }
    });
  }
}

export const portfolioEvents = new PortfolioEventEmitter();
