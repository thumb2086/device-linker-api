import { KVClient } from "@repo/infrastructure";

export interface PlatformAnnouncement {
  id: string;
  title: string;
  content: string;
  type: "info" | "warning" | "urgent";
  createdAt: string;
  active: boolean;
}

export class AnnouncementManager {
  private KEY = "platform:announcements";

  constructor(private kv: KVClient) {}

  async getActiveAnnouncements(): Promise<PlatformAnnouncement[]> {
    const list = await this.kv.get<PlatformAnnouncement[]>(this.KEY) || [];
    return (list as any[] || []).filter(a => a.active).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async addAnnouncement(announcement: any): Promise<void> {
    const list = await this.kv.get<PlatformAnnouncement[]>(this.KEY) || [];
    const newItem: PlatformAnnouncement = {
      ...announcement,
      id: `ann_${Date.now()}`,
      createdAt: new Date().toISOString(),
      active: true
    };
    list.push(newItem);
    await this.kv.set(this.KEY, list);
  }
}
