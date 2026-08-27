"""VisionBharat Model Smoke Tests - TEST DATA ONLY"""
import torch
import sys
import os
import math

sys.path.insert(0, os.path.dirname(__file__))

from model import VisionBharatDetector, create_visionbharat_model, DetectionLoss, compute_iou


def test_model_creation():
    model = create_visionbharat_model(num_classes=8)
    assert isinstance(model, VisionBharatDetector)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Model created: {total_params:,} parameters")
    assert total_params > 0
    return model


def test_no_pretrained():
    model = create_visionbharat_model(num_classes=8)
    for name, param in model.named_parameters():
        assert 'pretrained' not in name.lower(), f"Found pretrained param: {name}"
    print("  No pretrained parameters found")


def test_forward_pass():
    model = create_visionbharat_model(num_classes=8)
    model.eval()
    x = torch.randn(1, 3, 640, 640)
    with torch.no_grad():
        outputs = model(x)
    assert len(outputs) == 3, f"Expected 3 detection levels, got {len(outputs)}"
    for i, (obj, box, cls) in enumerate(outputs):
        assert obj.shape[0] == 1, f"Batch size mismatch at level {i}"
        num_anchors = obj.shape[1]
        assert cls.shape[1] == num_anchors * 8, f"Expected {num_anchors}*8 channels at level {i}, got {cls.shape[1]}"
    print(f"  Forward pass OK: 3 levels, shapes correct")


def test_loss():
    model = create_visionbharat_model(num_classes=8)
    model.train()
    x = torch.randn(1, 3, 640, 640)
    outputs = model(x)
    loss_fn = DetectionLoss(num_classes=8)
    targets = [{'boxes': torch.tensor([[0.5, 0.5, 0.2, 0.3]]), 'class_ids': torch.tensor([0])}]
    total_loss, box_loss, obj_loss, cls_loss = loss_fn(outputs, targets)
    assert torch.isfinite(total_loss), f"Loss is not finite: {total_loss}"
    print(f"  Loss OK: total={total_loss.item():.4f}, box={box_loss.item():.4f}, obj={obj_loss.item():.4f}, cls={cls_loss.item():.4f}")


def test_gradients():
    model = create_visionbharat_model(num_classes=8)
    model.train()
    x = torch.randn(1, 3, 640, 640)
    outputs = model(x)
    loss_fn = DetectionLoss(num_classes=8)
    targets = [{'boxes': torch.tensor([[0.5, 0.5, 0.2, 0.3]]), 'class_ids': torch.tensor([0])}]
    total_loss, _, _, _ = loss_fn(outputs, targets)
    total_loss.backward()
    grad_count = sum(1 for p in model.parameters() if p.grad is not None)
    total_count = sum(1 for p in model.parameters())
    assert grad_count > 0, "No gradients computed"
    print(f"  Gradients OK: {grad_count}/{total_count} parameters have gradients")


def test_optimizer_step():
    model = create_visionbharat_model(num_classes=8)
    model.train()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    params_before = {n: p.clone() for n, p in model.named_parameters()}
    x = torch.randn(1, 3, 640, 640)
    outputs = model(x)
    loss_fn = DetectionLoss(num_classes=8)
    targets = [{'boxes': torch.tensor([[0.5, 0.5, 0.2, 0.3]]), 'class_ids': torch.tensor([0])}]
    total_loss, _, _, _ = loss_fn(outputs, targets)
    total_loss.backward()
    optimizer.step()
    changed = any(not torch.equal(params_before[n], p) for n, p in model.named_parameters())
    assert changed, "Optimizer did not change any parameters"
    print("  Optimizer step OK: parameters changed")


def test_checkpoint_save_load():
    model = create_visionbharat_model(num_classes=8)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    ckpt_path = os.path.join(os.path.dirname(__file__), "_test_ckpt.pt")
    torch.save({
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'num_classes': 8,
        'from_scratch': True,
    }, ckpt_path)
    ckpt = torch.load(ckpt_path, weights_only=False)
    assert ckpt['from_scratch'] is True
    model2 = create_visionbharat_model(num_classes=8)
    model2.load_state_dict(ckpt['model_state_dict'])
    os.unlink(ckpt_path)
    print("  Checkpoint save/load OK")


def test_iou():
    box1 = torch.tensor([0.4, 0.4, 0.6, 0.6])
    box2 = torch.tensor([0.4, 0.4, 0.6, 0.6])
    iou = compute_iou(box1, box2)
    assert abs(float(iou) - 1.0) < 0.01, f"IoU of identical boxes should be 1, got {iou}"

    box3 = torch.tensor([0.8, 0.8, 1.0, 1.0])
    iou2 = compute_iou(box1, box3)
    assert float(iou2) < 0.1, f"IoU of non-overlapping boxes should be ~0, got {iou2}"

    box4 = torch.tensor([0.5, 0.5, 0.7, 0.7])
    iou3 = compute_iou(box1, box4)
    assert 0.0 < float(iou3) < 1.0, f"IoU of partial overlap should be between 0 and 1, got {iou3}"
    print(f"  IoU OK: identical={float(iou):.4f}, non-overlap={float(iou2):.4f}, partial={float(iou3):.4f}")


def test_empty_target_loss():
    model = create_visionbharat_model(num_classes=8)
    model.train()
    x = torch.randn(1, 3, 640, 640)
    outputs = model(x)
    loss_fn = DetectionLoss(num_classes=8)
    targets = [{'boxes': torch.zeros(0, 4), 'class_ids': torch.zeros(0, dtype=torch.long)}]
    total_loss, box_loss, obj_loss, cls_loss = loss_fn(outputs, targets)
    assert torch.isfinite(total_loss), f"Empty-target loss is not finite: {total_loss}"
    print(f"  Empty-target loss OK: total={total_loss.item():.4f}")


if __name__ == "__main__":
    print("=" * 60)
    print("VISIONBHARAT MODEL SMOKE TESTS (TEST DATA ONLY)")
    print("=" * 60)
    test_model_creation()
    test_no_pretrained()
    test_forward_pass()
    test_loss()
    test_gradients()
    test_optimizer_step()
    test_checkpoint_save_load()
    test_iou()
    test_empty_target_loss()
    print("=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)
