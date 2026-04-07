---
title: GPU ASG Always-On (min_size=1)
date: 2026-03-29
status: approved
---

## Summary

Change the GPU tier Auto Scaling Group from cold-start (min=0) to always-on (min=1) using Spot pricing, eliminating the cold-start delay on first Ollama request.

## Current State

`infra/resources.tf` — `aws_autoscaling_group.gpu`:
- `min_size = 0`, `desired_capacity = 0`
- Scales up from zero when ECS detects pending Ollama tasks
- Results in a cold-start delay (instance boot + ECS registration + model load) on first request

## Change

Set `min_size = 1` and `desired_capacity = 1` on `aws_autoscaling_group.gpu`.

Everything else remains unchanged:
- Instance type: `g5.2xlarge` (primary), `g5.xlarge` (fallback)
- Pricing: 100% Spot (`on_demand_percentage_above_base_capacity = 0`)
- Spot strategy: `capacity-optimized`
- Spot draining: `ECS_ENABLE_SPOT_INSTANCE_DRAINING=true` already configured
- ECS managed scaling: still active; `ignore_changes = [desired_capacity]` prevents Terraform from fighting ECS

## Behavior After Change

- One g5 Spot instance is always running after `terraform apply`
- No cold-start on first Ollama request
- If AWS reclaims the Spot instance, ASG immediately requests a replacement; ECS drains tasks first
- Cost: ~$0.50–$0.80/hr (g5.2xlarge Spot in me-central-1, approximate)

## Files to Modify

- `infra/resources.tf`: lines 460–462 (`min_size`, `desired_capacity` on `aws_autoscaling_group.gpu`)
