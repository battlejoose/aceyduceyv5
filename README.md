solana program deploy target/deploy/acey.so --with-compute-unit-price 300000 --use-rpc --max-sign-attempts 1000 
solana config set --url "https://boldest-thrilling-market.solana-mainnet.quiknode.pro/b4c82bf3b9abce9c0f2a06b213b35da920beaf58/"

solana-keygen new --outfile target/deploy/acey-keypair.json --force 
anchor keys sync

anchor build -- --features devnet

solana program close 27GsfeibJMv8hftdRzaoSTgnCUB7RqnjUAnWW6EBiJub --bypass-warning




solana program set-upgrade-authority Av3xwJunX5Crq1FXmq6XX2agwfD1Meb7jARgR5bs6qXb --new-upgrade-authority 3zHujEeVSYCkrQUCfZAEG6dL6SEtRrvfXCAB33hdUL7n --skip-new-upgrade-authority-signer-check