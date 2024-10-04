export default class NotificationManager {
    static async requestPermission() {
        if (Notification.permission === "default") {
            const permission = await Notification.requestPermission();
            return permission;
        }
        return Notification.permission;
    }

    static showNotification(title, options = {}) {
        if (Notification.permission !== "granted") {
            throw new Error("Notification permission not granted.");
        }

        return new Notification(title, options);
    }

    static checkPermission() {
        return Notification.permission;
    }
}
