function cw_drawVirtualPoly(body, vtx, n_vtx, canvas) {
  // set strokestyle and fillstyle before call
  // call beginPath before call

  var p0 = body.GetWorldPoint(vtx[0]);
  canvas.moveTo(p0.x, p0.y);
  for (var i = 1; i < n_vtx; i++) {
    p = body.GetWorldPoint(vtx[i]);
    canvas.lineTo(p.x, p.y);
  }
  canvas.lineTo(p0.x, p0.y);
}

function cw_drawPoly(body, vtx, n_vtx, canvas) {
  // set strokestyle and fillstyle before call
  canvas.beginPath();

  var p0 = body.GetWorldPoint(vtx[0]);
  canvas.moveTo(p0.x, p0.y);
  for (var i = 1; i < n_vtx; i++) {
    p = body.GetWorldPoint(vtx[i]);
    canvas.lineTo(p.x, p.y);
  }
  canvas.lineTo(p0.x, p0.y);

  canvas.fill();
  canvas.stroke();
}

function cw_drawCircle(body, center, radius, angle, color, canvas) {
  var p = body.GetWorldPoint(center);
  canvas.fillStyle = color;

  canvas.beginPath();
  canvas.arc(p.x, p.y, radius, 0, 2*Math.PI, true);

//  canvas.moveTo(p.x, p.y);
//  canvas.lineTo(p.x + radius*Math.cos(angle), p.y + radius*Math.sin(angle));

  canvas.fill();
  canvas.stroke();
}