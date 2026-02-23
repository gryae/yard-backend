import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { LocationService } from './location.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('location')
export class LocationController {
  constructor(private locationService: LocationService) {}

  @Get('zones')
  async getZones() {
    return this.locationService.getZones()
  }

  @Get('rows')
  async getRows(@Query('zone') zone: string) {
    return this.locationService.getRows(zone)
  }

  @Get('available')
  async getAvailable(
    @Query('zone') zone?: string,
    @Query('row') row?: string,
  ) {
    return this.locationService.getAvailable(zone, row)
  }


  @UseGuards(JwtAuthGuard)
  @Get('zone-map')
  async getZoneMap(@Query('zone') zone: string) {
    return this.locationService.getZoneMap(zone)
  }

}