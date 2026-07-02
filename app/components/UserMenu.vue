<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { user, clear } = useUserSession()
const toast = useToast()

const isLoggingOut = ref(false)

const {
  neutralColors,
  neutral,
  primaryColors,
  primary,
  blackAsPrimary,
  setBlackAsPrimary,
  radiuses,
  radius,
  fonts,
  font,
  icon,
  icons,
  modes,
  mode
} = useTheme()

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: user.value?.name || user.value?.username,
  avatar: {
    src: user.value?.avatar,
    alt: user.value?.name || user.value?.username
  }
}], [{
  label: 'Theme',
  icon: 'i-lucide-palette',
  children: [{
    label: 'Primary',
    slot: 'chip',
    chip: primary.value,
    content: {
      align: 'center',
      collisionPadding: 16
    },
    children: [{
      label: 'Black',
      chip: 'black',
      slot: 'chip',
      type: 'checkbox',
      checked: blackAsPrimary.value,
      onSelect: (e) => {
        e.preventDefault()

        setBlackAsPrimary(true)
      }
    }, ...primaryColors.map(color => ({
      label: color,
      chip: color,
      slot: 'chip',
      checked: !blackAsPrimary.value && primary.value === color,
      type: 'checkbox',
      onSelect: (e) => {
        e.preventDefault()

        primary.value = color
      }
    } as DropdownMenuItem))]
  }, {
    label: 'Neutral',
    slot: 'chip',
    chip: neutral.value === 'neutral' ? 'old-neutral' : neutral.value,
    content: {
      align: 'end',
      collisionPadding: 16
    },
    children: neutralColors.map(color => ({
      label: color,
      chip: color === 'neutral' ? 'old-neutral' : color,
      slot: 'chip',
      type: 'checkbox',
      checked: neutral.value === color,
      onSelect: (e) => {
        e.preventDefault()

        neutral.value = color
      }
    }))
  }]
}, {
  label: 'Radius',
  icon: 'i-lucide-radius',
  children: radiuses.map(r => ({
    label: `${r}`,
    type: 'checkbox',
    checked: radius.value === r,
    onSelect: (e) => {
      e.preventDefault()

      radius.value = r
    }
  }))
}, {
  label: 'Font',
  icon: 'i-lucide-type',
  children: fonts.map(f => ({
    label: f,
    type: 'checkbox',
    checked: font.value === f,
    onSelect: (e) => {
      e.preventDefault()

      font.value = f
    }
  }))
}, {
  label: 'Icon',
  icon: 'i-lucide-shapes',
  children: icons.map(i => ({
    label: i.label,
    icon: i.icon,
    type: 'checkbox',
    checked: icon.value === i.value,
    onSelect: (e) => {
      e.preventDefault()

      icon.value = i.value
    }
  }))
}, {
  label: 'Appearance',
  icon: 'i-lucide-sun-moon',
  children: modes.value.map(m => ({
    label: m.label,
    icon: m.icon,
    type: 'checkbox',
    checked: mode.value === m.label,
    onSelect: (e) => {
      e.preventDefault()

      mode.value = m.label
    }
  }))
}], [{
  label: 'GitHub repository',
  icon: 'i-simple-icons-github',
  to: 'https://github.com/mhaibaraai/movk-studio',
  target: '_blank'
}], [{
  label: 'Log out',
  icon: 'i-lucide-log-out',
  loading: isLoggingOut.value,
  async onSelect(e) {
    e.preventDefault()

    if (isLoggingOut.value)
      return

    isLoggingOut.value = true

    try {
      await clear()
      toast.add({ title: '已退出登录', color: 'success', icon: 'i-lucide-circle-check' })
      await navigateTo('/')
    } catch {
      toast.add({ title: '退出登录失败', description: '请重试', color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      isLoggingOut.value = false
    }
  }
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        label: collapsed ? undefined : (user?.name || user?.username),
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
      }"
      :avatar="{
        src: user?.avatar || undefined,
        alt: user?.name || user?.username
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #chip-leading="{ item }">
      <div class="inline-flex items-center justify-center shrink-0 size-5">
        <span
          class="rounded-full ring ring-bg bg-(--chip-light) dark:bg-(--chip-dark) size-2"
          :style="(item as any).chip === 'black'
            ? { '--chip-light': 'black', '--chip-dark': 'white' }
            : {
              '--chip-light': `var(--color-${(item as any).chip}-500)`,
              '--chip-dark': `var(--color-${(item as any).chip}-400)`
            }"
        />
      </div>
    </template>
  </UDropdownMenu>
</template>
