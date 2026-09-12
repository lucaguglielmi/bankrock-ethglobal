INSERT INTO DailyYield (rockId, date, apy, volume) VALUES 
('rock-0', '2023-01-01', 10.5, 1200),
('rock-0', '2023-02-01', 11.2, 1800),
('rock-0', '2023-03-01', 12.0, 2500),
('rock-0', '2023-04-01', 18.5, 4500);

INSERT INTO Events (id, rockId, type, title, description, txHash, timestamp) VALUES 
('seed-ev-1', 'rock-0', 'trade', 'Aqua Constant Product Reserve Seeded', 'Initial liquidity pool configured with 1,250.00 USDC and 0.50 WETH maker balance.', '0x89f72b9a4c51e038db4f11467a98bce19d45e5229348cbe78216ba7b11d9f041', '2023-04-01T10:00:00Z'),
('seed-ev-2', 'rock-0', 'awaken', 'Safe Smart Account Deployed', 'ERC-4337 Safe account instantiated via Pimlico Paymaster on Base Sepolia with dual gas sponsorship.', '0x3c9a1be963cc7947db4cd9910eed30a2c79bc8a39aed5177968041348136a5f2', '2023-04-01T10:05:00Z');
