import UserSession from "./UserSession.vue";

export default {
    title: "Components/UserSession",
    component: UserSession,
};

export const Default = {
    render: (args) => ({
        components: { UserSession },
        setup() {
            return args;
        },
        template: "<UserSession />",
    }),
};

export const LoggedOut = {
    render: (args) => ({
        components: { UserSession },
        setup() {
            return args;
        },
        template: "<UserSession />",
    }),
};

export const LoggedIn = {
    render: (args) => ({
        components: { UserSession },
        setup() {
            return args;
        },
        template: "<UserSession />",
    }),
};
