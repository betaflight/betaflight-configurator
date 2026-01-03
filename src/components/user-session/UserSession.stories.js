import { onUnmounted } from "vue";
import loginManager from "../../js/LoginManager";
import UserSession from "./UserSession.vue";

// Helper to patch loginManager for a story and restore on unmount
const withSessionState = (sessionArgs) => {
    const original = {
        isUserLoggedIn: loginManager.isUserLoggedIn,
        fetchUserProfile: loginManager.fetchUserProfile,
        getUserProfile: loginManager.getUserProfile,
        onLogin: loginManager.onLogin,
        onLogout: loginManager.onLogout,
        signOut: loginManager.signOut,
        getUserApi: loginManager.getUserApi,
    };

    const loggedIn = sessionArgs?.isLoggedIn ?? false;
    const profile = loggedIn
        ? {
            name: sessionArgs?.userName || "",
            email: sessionArgs?.userEmail || "",
            avatar: sessionArgs?.avatar || "",
        }
        : null;

    loginManager.isUserLoggedIn = async () => loggedIn;
    loginManager.fetchUserProfile = async () => profile;
    loginManager.getUserProfile = () => profile;
    loginManager.onLogin = () => () => {};
    loginManager.onLogout = () => () => {};
    loginManager.signOut = async () => {};
    loginManager.getUserApi = () => ({
        profile: async () => profile,
    });

    onUnmounted(() => {
        Object.assign(loginManager, original);
    });
};

// Helper function to create story render configuration
const createStory = (storyArgs = {}) => ({
    args: storyArgs.args,
    render: (args) => ({
        components: { UserSession },
        setup() {
            withSessionState(args);
            return args;
        },
        template: "<UserSession />",
    }),
});

export default {
    title: "Components/UserSession",
    component: UserSession,
};

export const Default = createStory();
export const LoggedOut = createStory({ args: { isUserLoggedIn: false } });
export const LoggedIn = createStory({
    args: { isUserLoggedIn: true, userEmail: "user@example.com", userName: "Sample User" },
});
