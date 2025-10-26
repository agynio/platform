// Issue #451: out-of-scope legacy container provider tests removed (skipped)
          id: 'ws3',
          data: {
            template: 'workspace',
            config: {
              image: 'alpine:3',
              nix: { packages: [{ name: 'git', version: '2.44.0', attribute_path: 'pkgs/git', commit_hash: 'abc123' }] },
            },
          },
        },
      ],
      edges: [],
    };
    const res = await runtime.apply(graph);
    expect(res.errors.length).toBe(0);
  });
});
