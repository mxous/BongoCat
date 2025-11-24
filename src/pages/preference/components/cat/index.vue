<script setup lang="ts">
import { InputNumber, Slider, Switch } from 'ant-design-vue'
import { invoke } from '@tauri-apps/api/core'
import { onMounted, watch } from 'vue'

import ProList from '@/components/pro-list/index.vue'
import ProListItem from '@/components/pro-list-item/index.vue'
import { useCatStore } from '@/stores/cat'

const catStore = useCatStore()

// Initialize the rumble value on the backend when component mounts
onMounted(async () => {
  try {
    await invoke('set_rumble_value', { value: catStore.window.rumble })
  } catch (error) {
    console.error('Failed to set rumble value:', error)
  }
})

// Watch for changes to the rumble value and sync with backend
watch(
  () => catStore.window.rumble,
  async (newValue) => {
    try {
      await invoke('set_rumble_value', { value: newValue })
    } catch (error) {
      console.error('Failed to set rumble value:', error)
    }
  },
)
</script>

<template>
  <ProList :title="$t('pages.preference.cat.labels.modelSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.mirrorMode')"
      :title="$t('pages.preference.cat.labels.mirrorMode')"
    >
      <Switch v-model:checked="catStore.model.mirror" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.singleMode')"
      :title="$t('pages.preference.cat.labels.singleMode')"
    >
      <Switch v-model:checked="catStore.model.single" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.mouseMirror')"
      :title="$t('pages.preference.cat.labels.mouseMirror')"
    >
      <Switch v-model:checked="catStore.model.mouseMirror" />
    </ProListItem>
  </ProList>

  <ProList :title="$t('pages.preference.cat.labels.windowSettings')">
    <ProListItem
      :description="$t('pages.preference.cat.hints.passThrough')"
      :title="$t('pages.preference.cat.labels.passThrough')"
    >
      <Switch v-model:checked="catStore.window.passThrough" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.alwaysOnTop')"
      :title="$t('pages.preference.cat.labels.alwaysOnTop')"
    >
      <Switch v-model:checked="catStore.window.alwaysOnTop" />
    </ProListItem>

    <ProListItem
      :description="$t('pages.preference.cat.hints.windowSize')"
      :title="$t('pages.preference.cat.labels.windowSize')"
    >
      <InputNumber
        v-model:value="catStore.window.scale"
        addon-after="%"
        class="w-28"
        :min="1"
      />
    </ProListItem>

    <ProListItem :title="$t('pages.preference.cat.labels.windowRadius')">
      <InputNumber
        v-model:value="catStore.window.radius"
        addon-after="%"
        class="w-28"
        :min="0"
      />
    </ProListItem>

    <ProListItem
      :title="$t('pages.preference.cat.labels.opacity')"
      vertical
    >
      <Slider
        v-model:value="catStore.window.opacity"
        class="m-0!"
        :max="100"
        :min="10"
        :tip-formatter="(value) => `${value}%`"
      />
    </ProListItem>

    <ProListItem
      :title="$t('pages.preference.cat.labels.rumble')"
      vertical
    >
      <Slider
        v-model:value="catStore.window.rumble"
        class="m-0!"
        :max="1000"
        :min="0"
      />
    </ProListItem>
  </ProList>
</template>
