<template>
    <Layout>
        <template #home-hero-before>
            <Hero />
        </template>
        <template #home-features-after>
            <Sponsors />
        </template>
    </Layout>
</template>

<script setup>
import DefaultTheme from "vitepress/theme";
import Hero from "./components/Hero.vue";
import Sponsors from "./components/Sponsors.vue";

const { Layout } = DefaultTheme;
</script>
