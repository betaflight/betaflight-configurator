import { defineStore } from "pinia";
import { ref } from "vue";
import loginManager from "@/js/LoginManager";

export const useAuthStore = defineStore("auth", () => {
    const isLoggedIn = ref(false);

    const refresh = async () => {
        isLoggedIn.value = await loginManager.isUserLoggedIn();
    };

    loginManager.onLogin(() => {
        isLoggedIn.value = true;
    });
    loginManager.onLogout(() => {
        isLoggedIn.value = false;
    });

    refresh();

    return { isLoggedIn, refresh };
});
