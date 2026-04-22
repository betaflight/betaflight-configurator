import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import loginManager from "@/js/LoginManager";

export const useAuthStore = defineStore("auth", () => {
    const isLoggedIn = ref(false);

    const refresh = async () => {
        isLoggedIn.value = await loginManager.isUserLoggedIn();
    };

    const unsubscribeLogin = loginManager.onLogin(() => {
        isLoggedIn.value = true;
    });
    const unsubscribeLogout = loginManager.onLogout(() => {
        isLoggedIn.value = false;
    });

    onScopeDispose(() => {
        unsubscribeLogin?.();
        unsubscribeLogout?.();
    });

    refresh();

    return { isLoggedIn, refresh };
});
