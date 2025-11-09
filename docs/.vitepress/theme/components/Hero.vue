<template>
  <header class="my-hero">
    <div class="container">
      <img
        class="logo"
        src="/logo.svg"
        alt="Omnipin logo"
        width="250"
        height="250"
      />
      <h1 class="title">
        The ultimate decentralized website deployment toolkit
      </h1>
      <img src="/demo.png" alt="Omnipin logo" />
      <p class="subtitle">
        Omnipin is a self-custodial command-line website deployment tool with
        automatic content replication and secure ENS updates, powered by Safe.
        No sign up required.
      </p>
      <div class="links">
        <a href="/docs/">Get Started</a>
        <a
          target="_blank"
          rel="noreferer"
          href="https://github.com/omnipin/omnipin"
          >GitHub</a
        >
      </div>
    </div>
  </header>
</template>

<style scoped>
header {
  text-align: center;
  margin: 0 auto;
  padding: 2rem 24px;
  max-width: var(--vp-layout-max-width);
}
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}
.title {
  line-height: 1.2;
  font-size: 1.25rem;
}
.subtitle {
  font-size: 0.95rem;
  max-width: 680px;
}

.links {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  align-items: center;
}

.links a {
  min-width: 140px;
  width: 100%;
}

.links a:nth-child(1) {
  border-radius: 99px;
  padding: 0.6rem 0;
}

.links a:first-child {
  transition-duration: 150ms;
  background-color: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}

.links a:first-child:hover {
  background-color: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

.links a:nth-child(2):hover {
  text-decoration: underline;
}

.links a:nth-child(2)::after {
  mask-image: var(--icon);
  content: "";
  color: currentColor;
  background-color: currentColor;
  display: inline-block;
  margin-top: -1px;
  margin-left: 4px;
  width: 11px;
  height: 11px;
  --icon: url("data:image/svg+xml, %3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' %3E%3Cpath d='M0 0h24v24H0V0z' fill='none' /%3E%3Cpath d='M9 5v2h6.59L4 18.59 5.41 20 17 8.41V15h2V5H9z' /%3E%3C/svg%3E");
}

header > div:nth-child(1) > img:nth-child(3) {
  max-width: 600px;
  width: 100%;
}

html.dark header .logo {
  content: url("/logo-dark.svg");
}

@media (max-width: 450px) {
  .links {
    flex-direction: column;
  }
}
</style>
