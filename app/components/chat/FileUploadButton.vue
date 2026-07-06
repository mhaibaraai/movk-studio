<script setup lang="ts">
const { loggedIn } = useUserSession()

defineProps<{
  open: () => void
}>()
</script>

<template>
  <UTooltip
    :content="{
      side: 'top'
    }"
    :text="!loggedIn ? '您需要登录才能上传文件' : ''"
  >
    <UButton
      icon="i-lucide-paperclip"
      variant="ghost"
      color="neutral"
      size="sm"
      :disabled="!loggedIn"
      aria-label="Attach file"
      @click="open()"
    />
  </UTooltip>
</template>
