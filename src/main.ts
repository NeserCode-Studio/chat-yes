import { createApp } from "vue"
import App from "./App.vue"

// Vue Router
import router from "./router"
// Vue Pinia
import { createPinia } from "pinia"
const pinia = createPinia()

/* Style: Tailwind 4 CSS-first (tokens + base + components) */
import "./style.tailwind.css"
import "./styles/nextchat.css"

createApp(App).use(router).use(pinia).mount("#app")
