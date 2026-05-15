// Omnipin Plugin Example
// Demonstrates how to create plugins with before/after hooks for pin, ens, and deploy commands

export const examplePlugin = {
  name: 'example-plugin',
  
  setup(api) {
    // PIN ACTION HOOKS
    api.before('pin', (ctx) => {
      console.log(`[Example Plugin] Before PIN: ${ctx.cid}`)
      return ctx
    })

    api.after('pin', (ctx) => {
      console.log(`[Example Plugin] After PIN: ${ctx.cid} - Success: ${ctx.succeeded.length}, Failed: ${ctx.failed.length}`)
    })

    // ENS ACTION HOOKS
    api.before('ens', (ctx) => {
      console.log(`[Example Plugin] Before ENS: ${ctx.domain} -> ${ctx.cid}`)
      return ctx
    })

    api.after('ens', (ctx) => {
      console.log(`[Example Plugin] After ENS: ${ctx.domain} updated`)
    })

    // DEPLOY ACTION HOOKS
    api.before('deploy', (ctx) => {
      console.log(`[Example Plugin] Before DEPLOY: ${ctx.dir}`)
      return ctx
    })

    api.after('deploy', (ctx) => {
      console.log(`[Example Plugin] After DEPLOY: ${ctx.cid} via ${ctx.protocol}`)
    })
  }
}

export default examplePlugin