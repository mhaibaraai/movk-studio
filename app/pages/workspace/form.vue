<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'

const schema = useFormWorkspace()
const values = useFormValues()
const toast = useToast()

const { afz } = useAutoForm()

const compiled = computed(() => compileFormSchema(schema.value, afz))
const isEmpty = computed(() => schema.value.fields.length === 0)

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
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div v-if="isEmpty" class="h-full flex items-center justify-center p-6">
      <div class="flex flex-col items-center gap-3 text-center max-w-sm">
        <UIcon name="i-lucide-shapes" class="size-10 text-dimmed" />
        <p class="text-sm text-muted">
          告诉 Copilot 你想要什么表单，例如「做一个员工入职登记表」。字段、校验与布局会实时出现在这里，并且可以直接填写试用。
        </p>
      </div>
    </div>

    <div v-else class="mx-auto max-w-3xl flex flex-col gap-6 p-6">
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
    </div>
  </div>
</template>
