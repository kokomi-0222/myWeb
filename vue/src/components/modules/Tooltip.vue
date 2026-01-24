<script setup>
import { ref } from 'vue';
import { useFloating, autoUpdate, offset } from '@floating-ui/vue';

const open = ref(false);
const reference = ref();
const floating = ref();

const { floatingStyles } = useFloating(reference, floating, {
  open,
  whileElementsMounted: autoUpdate,
  placement: 'top',
  middleware: [offset(8)]
});

const toggle = () => (open.value = !open.value);
</script>

<template>
  <button ref="reference" @click="toggle">Click me</button>

  <Teleport to="body">
    <div v-if="open" ref="floating" :style="floatingStyles" 
         style="background:#333;color:#fff;padding:6px 10px;border-radius:4px;">
      Hello Floating UI!
    </div>
  </Teleport>
</template>
