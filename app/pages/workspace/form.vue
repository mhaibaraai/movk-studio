<script setup lang="ts">
import type { FormSubmitEvent, TabsItem } from '@nuxt/ui'

const schema = useFormWorkspace()
const values = useFormValues()
const toast = useToast()

const { afz } = useAutoForm()
const { $prettier } = useNuxtApp()

const compiled = computed(() => compileFormSchema(schema.value, afz))
const isEmpty = computed(() => schema.value.fields.length === 0)

const source = computed(() => generateFormCode(schema.value))

// server: false —— 画布整体在 ClientOnly 内，服务端格式化一份用不上的空表单代码纯属浪费。
// 格式化失败（生成的代码混进非法语法）时退回原始源码，代码页签不能因此空白
const { data: code } = await useAsyncData(
  'form-code',
  () => $prettier.format(source.value).catch(() => source.value),
  { watch: [source], default: () => '', server: false }
)

const codeMarkdown = computed(() => `\`\`\`vue\n${code.value || source.value}\n\`\`\``)

const tab = ref('preview')
const tabs: TabsItem[] = [
  { value: 'preview', label: '预览', icon: 'i-lucide-eye' },
  { value: 'code', label: '代码', icon: 'i-lucide-code' }
]

const { copy, copied } = useClipboard()

function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  toast.add({
    title: '校验通过',
    description: `已提交 ${Object.keys(event.data).length} 个字段`,
    icon: 'i-lucide-circle-check',
    color: 'success'
  })
}
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <!-- 表单结构是「当前消息的纯归约」，而派发器是客户端独占的：SSR 期状态恒为空，
         但页面 hydrate 时 CopilotPanel 的派发器已把状态算好，两侧渲染的分支必然不同。
         这块画布本就是客户端投影，明确声明比让 hydration 去对齐更诚实 -->
    <ClientOnly>
      <template #fallback>
        <div class="flex-1 flex items-center justify-center p-6">
          <USkeleton class="h-8 w-48" />
        </div>
      </template>

      <div v-if="isEmpty" class="flex-1 flex items-center justify-center p-6">
        <div class="flex flex-col items-center gap-3 text-center max-w-sm">
          <UIcon name="i-lucide-shapes" class="size-10 text-dimmed" />
          <p class="text-sm text-muted">
            告诉 Copilot 你想要什么表单，例如「做一个员工入职登记表」。字段、校验与布局会实时出现在这里，并且可以直接填写试用。
          </p>
        </div>
      </div>

      <template v-else>
        <div class="flex items-center justify-between gap-4 px-6 pt-4">
          <UTabs
            v-model="tab"
            :items="tabs"
            size="sm"
            :content="false"
            class="w-fit"
          />

          <UButton
            v-if="tab === 'code'"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? '已复制' : '复制代码'"
            color="neutral"
            variant="subtle"
            size="sm"
            @click="copy(code)"
          />
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="mx-auto max-w-3xl flex flex-col gap-6 p-6">
            <template v-if="tab === 'preview'">
              <div class="flex flex-col gap-1">
                <h1 class="text-xl font-semibold text-highlighted">
                  {{ schema.title || '未命名表单' }}
                </h1>
                <p v-if="schema.description" class="text-sm text-muted">
                  {{ schema.description }}
                </p>
              </div>

              <MAutoForm
                :schema="compiled"
                :state="values"
                :submit-button-props="{ label: schema.submitText || '提交' }"
                @submit="onSubmit"
              />
            </template>

            <ChatComark v-else :markdown="codeMarkdown" />
          </div>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
