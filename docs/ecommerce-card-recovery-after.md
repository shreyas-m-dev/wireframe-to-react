# Ecommerce card recovery after multi-pass recovery

Before: zero accepted cards and no card diagnostic passes. After: the reusable
multi-pass detector produced 10 raw candidates and a five-item geometry
consensus from the related-content ROI. The accepted count is inferred from
that consensus, not a configured product count. Candidate evidence combines
CLAHE/bilateral edge recovery, adaptive threshold contours, cross-pass
deduplication, aligned tops, similar dimensions, and gap consistency.

The fixture now records card pass images and a complete `card-recovery.json`.
This improves repeated-group evidence, but the page remains `needs-review`
because search/select/primary-action evidence has not yet been recovered.
No high-fidelity claim is made.
