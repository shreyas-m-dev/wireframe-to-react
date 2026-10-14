# Ecommerce card recovery baseline

Evidence comes from the pre-change fixture diagnostics. The related-products
ROI was `x=0, y=655, width=1024, height=225`. The OCR heading `Similar
Products` was `x=444, y=798.86, width=136, height=33.71`, leaving little
unambiguous content below the heading within this normalized ROI.

`card-recovery.json` contained no groups. The generic ROI pass used only a
single Canny profile in `roi_recovery.recover_roi`; it produced candidates but
`group_repeated` required at least two similarly sized candidates above
`0.08 * parent width` and `0.18 * parent height`. No candidate cluster met
that test. Rejections recorded were global duplicates/ROI duplicates; no
adaptive-threshold, projection, internal-media, or clipped-card pass existed.

Manual visual expectation is approximately five lower cards, but this is not
detector ground truth. The likely failure factors are faint/fragmented borders,
the heading consuming the upper part of the macro ROI, and lower-edge clipping.
The relevant constants/functions were `recover_roi` Canny `(40,120)`, local
minimum size `3.5%` of parent, duplicate IoU `.72/.65`, and
`group_repeated`'s size variation `.28` and card size filters in
`recover_regions`.
