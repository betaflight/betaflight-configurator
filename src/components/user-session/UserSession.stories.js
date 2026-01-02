import UserSession from "./UserSession.vue";

// Helper function to create story render configuration
const createStory = () => ({
    render: (args) => ({
        components: { UserSession },
        setup() {
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
export const LoggedOut = createStory();
export const LoggedIn = createStory();
