import './helpers/setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../storage/memory-store.js';
import { defineStoreContract } from './store-contract.js';

defineStoreContract({ makeStore: async () => createMemoryStore(), test, assert });
