<script lang="ts" setup>
import { Chat } from '@ai-sdk/vue'

const open = ref(true)
const input = ref('')

const quickChats = [
  '飞到上海并标注外滩，叠加天地图影像',
  '这附近有哪些 POI？',
  '切换 3D 倾斜视角',
  '删除所有标注'
]

const chat = new Chat({})

// async function createChat(prompt: string) {
//   input.value = prompt
//   loading.value = true

//   const parts: Array<{ type: string, text?: string, mediaType?: string, url?: string }> = [{ type: 'text', text: prompt }]

//   if (uploadedFiles.value.length > 0) {
//     parts.push(...uploadedFiles.value)
//   }

//   const chat = await $fetch('/api/chats', {
//     method: 'POST',
//     headers: { [headerName]: csrf },
//     body: {
//       id: chatId,
//       message: {
//         role: 'user',
//         parts
//       }
//     }
//   })

//   refreshNuxtData('chats')
//   navigateTo(`/chat/${chat?.id}`)
// }

// async function onSubmit() {
//   await createChat(input.value)
//   clearFiles()
// }
</script>

<template>
  <div class="flex-1 flex gap-4">
    <Placeholder class="flex-1" />

    <USidebar
      v-model:open="open"
      side="right"
      close
      close-icon="i-lucide-panel-right-close"
      rail
      collapsible="icon"
      :style="{ '--sidebar-width': '25rem' }"
      title="Copilot"
    >
      <template #footer>
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="quickChat in quickChats"
              :key="quickChat"
              :label="quickChat"
              size="sm"
              color="neutral"
              variant="subtle"
              class="rounded-full"
            />
          </div>

          <UChatPrompt
            v-model="input"
            class="[view-transition-name:chat-prompt]"
            variant="subtle"
            autofocus
            placeholder="输入指令，让 AI 操作当前模块…"
            size="sm"
            :ui="{ base: 'px-1.5' }"
          >
            <!-- <template v-if="files.length > 0" #header>
              <ChatFiles :files="files" @remove="removeFile" />
            </template> -->

            <template #footer>
              <div class="flex items-center gap-1">
                <!-- <ChatFileUploadButton /> -->

                <ModelSelect />
              </div>

              <UChatPromptSubmit
                :disabled="!input.trim()"
                color="neutral"
                size="sm"
                @stop="chat.stop()"
                @reload="chat.regenerate()"
              />
            </template>
          </UChatPrompt>
        </div>
      </template>
    </USidebar>
  </div>
</template>
