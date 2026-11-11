/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import type { Meta, StoryObj } from "@storybook/vue3-vite";
import { onUnmounted } from "vue";
import loginManager from "../../js/LoginManager";
import type { UserProfile } from "../../js/UserApi";
import UserSession from "./UserSession.vue";

/** The session a story shows; UserSession itself takes no props. */
interface SessionArgs {
    isLoggedIn?: boolean;
    userName?: string;
    userEmail?: string;
    avatar?: string;
}

// Patch loginManager for a story and restore it on unmount
const withSessionState = (sessionArgs: SessionArgs) => {
    const original = {
        isUserLoggedIn: loginManager.isUserLoggedIn,
        fetchUserProfile: loginManager.fetchUserProfile,
        getUserProfile: loginManager.getUserProfile,
        onLogin: loginManager.onLogin,
        onLogout: loginManager.onLogout,
        signOut: loginManager.signOut,
    };

    const loggedIn = sessionArgs.isLoggedIn ?? false;
    const profile: UserProfile | null = loggedIn
        ? {
              name: sessionArgs.userName || "",
              email: sessionArgs.userEmail || "",
              avatar: sessionArgs.avatar || "",
          }
        : null;

    loginManager.isUserLoggedIn = async () => loggedIn;
    loginManager.fetchUserProfile = async () => {};
    loginManager.getUserProfile = () => profile;
    loginManager.onLogin = () => () => {};
    loginManager.onLogout = () => () => {};
    loginManager.signOut = async () => {};

    onUnmounted(() => {
        Object.assign(loginManager, original);
    });
};

const meta = {
    title: "Components/UserSession",
    component: UserSession,
    render: (args) => ({
        components: { UserSession },
        setup() {
            withSessionState(args);
        },
        template: "<UserSession />",
    }),
} satisfies Meta<SessionArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LoggedOut: Story = { args: { isLoggedIn: false } };
export const LoggedIn: Story = {
    args: { isLoggedIn: true, userEmail: "user@example.com", userName: "Sample User" },
};
