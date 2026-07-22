import { getAllAds } from '../services/sheets.service.js'

export async function getAds(req, res, next) {
  try {
    const ads = await getAllAds()
    res.json(ads)
  } catch (err) {
    next(err)
  }
}
