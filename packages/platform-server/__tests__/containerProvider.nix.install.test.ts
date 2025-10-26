// Issue #451: out-of-scope legacy container provider tests removed (skipped)
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('succeeded for'))).toBe(true);
    expect((logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('failed for'))).toBe(true);
  });

  it('logs unresolved legacy/UI shapes and skips', async () => {
    const { provider, svc, logger } = makeProvider();
    provider.setConfig({ image: 'alpine:3', nix: { packages: [ { attr: 'htop' }, { name: 'htop', version: '1.2.3' } ] } } as unknown as ContainerProviderStaticConfig);
    await provider.provide('t');
    const calls = (svc.created as FakeContainer).getExecCalls();
    // No detection nor install
    expect(calls.length).toBe(0);
    expect((logger.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('unresolved'))).toBe(true);
  });
});
